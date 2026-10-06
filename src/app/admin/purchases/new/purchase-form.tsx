"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { findByBarcode, searchProducts } from "@/features/pos/catalog";
import type { PosProduct } from "@/features/pos/types";
import { formatCents, parseCents } from "@/features/pos/money";
import { confirmPurchase } from "@/features/purchases/actions";
import type { PurchaseLine } from "@/features/purchases/types";
import { effectivePurchaseLine, newClientKey, packageConversion, sanitizeIntegerInput, sanitizePurchaseDecimal } from "@/features/purchases/validation";
import type { Supplier } from "@/features/suppliers/types";

function emptyLine(product: PosProduct): PurchaseLine {
  return {
    product,
    entryMode: "UNIT",
    quantity: product.unit_type === "UNIT" ? "1" : "",
    unitPurchaseCost: "",
    packageQuantity: "1",
    unitsPerPackage: "1",
    packageCost: "",
  };
}

function money(cents: bigint | null) {
  return cents === null ? "—" : `S/. ${formatCents(cents)}`;
}

export function PurchaseForm({ suppliers, initialDate }: { suppliers: Supplier[]; initialDate: string }) {
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(initialDate);
  const [reference, setReference] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState(newClientKey);
  const [failedAttemptSignature, setFailedAttemptSignature] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const productSearchRef = useRef<HTMLInputElement>(null);

  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((supplier) => [supplier.name, supplier.ruc ?? ""].some((value) => value.toLowerCase().includes(term)));
  }, [supplierSearch, suppliers]);

  const previews = lines.map((line) => ({ line, effective: effectivePurchaseLine(line) }));
  const totalCents = previews.reduce((total, preview) => total + (preview.effective.lineCents ?? BigInt(0)), BigInt(0));

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (!term) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchProducts(term);
        if (!cancelled) setProducts(result.filter((product) => product.is_active));
      } catch {
        if (!cancelled) setMessage("No se pudieron buscar productos.");
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const visibleProducts = query.trim() ? products : [];

  function updateLine(productId: string, update: Partial<PurchaseLine>) {
    setLines((current) => current.map((line) => line.product.id === productId ? { ...line, ...update } : line));
  }

  function addProduct(product: PosProduct) {
    if (!product.is_active) {
      setMessage("Uno de los productos está inactivo.");
      return;
    }
    if (lines.some((line) => line.product.id === product.id)) {
      setMessage("El producto ya está agregado a la compra.");
      setHighlightedId(product.id);
      document.getElementById(`purchase-line-${product.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setLines((current) => [...current, emptyLine(product)]);
    setQuery("");
    setProducts([]);
    setMessage("");
    productSearchRef.current?.focus();
  }

  async function submitProductSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    try {
      const product = await findByBarcode(value);
      if (!product) {
        setMessage("Producto no encontrado. Créalo primero en Productos.");
        return;
      }
      addProduct(product);
    } catch {
      setMessage("No se pudo buscar el producto.");
    }
  }

  function switchToPackage(line: PurchaseLine) {
    const quantity = line.quantity.match(/^\d+$/) ? line.quantity : "1";
    const cost = parseCents(line.unitPurchaseCost);
    const packageCents = cost === null ? "" : formatCents(cost * BigInt(quantity));
    updateLine(line.product.id, { entryMode: "PACKAGE", packageQuantity: "1", unitsPerPackage: quantity, packageCost: packageCents });
  }

  function switchToDirect(line: PurchaseLine) {
    const conversion = packageConversion(line);
    updateLine(line.product.id, {
      entryMode: "UNIT",
      quantity: conversion.quantity ?? "",
      unitPurchaseCost: conversion.unitCost ?? "",
    });
  }

  function resetForAnotherPurchase() {
    setSupplierSearch("");
    setSupplierId("");
    setPurchaseDate(initialDate);
    setReference("");
    setQuery("");
    setProducts([]);
    setLines([]);
    setMessage("");
    setSuccess(null);
    setClientKey(newClientKey());
    setFailedAttemptSignature(null);
    window.setTimeout(() => productSearchRef.current?.focus(), 0);
  }

  function submitPurchase() {
    if (isPending || !supplierId || !purchaseDate || lines.length === 0) return;
    const items = previews.map(({ line, effective }) => {
      if (!effective.quantity || !effective.unitCost || effective.lineCents === null) return null;
      return { product_id: line.product.id, quantity: effective.quantity, unit_purchase_cost: effective.unitCost };
    });
    if (items.some((item) => item === null)) {
      setMessage("Completa cantidades y costos válidos. Las conversiones de paquetes deben tener un costo unitario exacto de 2 decimales.");
      return;
    }

    const attemptSignature = JSON.stringify({
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      reference: reference.trim(),
      items,
    });
    const requestClientKey = failedAttemptSignature !== null && failedAttemptSignature !== attemptSignature
      ? newClientKey()
      : clientKey;
    setClientKey(requestClientKey);
    setFailedAttemptSignature(attemptSignature);

    startTransition(async () => {
      const result = await confirmPurchase({
        client_key: requestClientKey,
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        reference,
        items: items as Array<{ product_id: string; quantity: string; unit_purchase_cost: string }>,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSuccess(`Compra registrada correctamente. Total: S/. ${formatCents(parseCents(String(result.purchase.total)) ?? totalCents)}`);
      setLines([]);
      setQuery("");
      setProducts([]);
      setMessage("");
      setClientKey(newClientKey());
      setFailedAttemptSignature(null);
    });
  }

  if (success) {
    return <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-6" role="status"><h2 className="text-lg font-semibold text-emerald-900">{success}</h2><p className="mt-2 text-sm text-emerald-800">El inventario y el costo actual fueron actualizados por la operación autorizada.</p><button type="button" onClick={resetForAnotherPurchase} className="mt-5 min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Registrar otra compra</button></section>;
  }

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{message}</p> : null}

      {suppliers.length === 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No hay proveedores activos. <Link href="/admin/suppliers/new" className="font-semibold underline">Registra un proveedor</Link> antes de continuar.</div> : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="text-base font-semibold">Datos de la compra</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><label htmlFor="supplier-search" className="block text-sm font-medium text-zinc-700">Proveedor *</label><input id="supplier-search" type="search" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Buscar por nombre o RUC" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />{filteredSuppliers.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">{filteredSuppliers.map((supplier) => <button key={supplier.id} type="button" onClick={() => setSupplierId(supplier.id)} className={`min-h-12 rounded-md border px-3 py-2 text-left text-sm ${supplier.id === supplierId ? "border-zinc-900 bg-zinc-100" : "border-zinc-200 hover:bg-zinc-50"}`}><span className="block font-semibold">{supplier.name}</span>{supplier.ruc ? <span className="text-xs text-zinc-500">RUC {supplier.ruc}</span> : null}</button>)}</div> : supplierSearch ? <p className="text-sm text-zinc-500">No hay proveedores activos que coincidan.</p> : null}{supplierId ? <p className="text-sm font-medium text-emerald-700">Proveedor seleccionado: {suppliers.find((supplier) => supplier.id === supplierId)?.name}</p> : null}</div>
        <div className="space-y-1"><label htmlFor="purchase-date" className="block text-sm font-medium text-zinc-700">Fecha de compra *</label><input id="purchase-date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" /></div>
        <div className="space-y-1"><label htmlFor="purchase-reference" className="block text-sm font-medium text-zinc-700">Referencia <span className="font-normal text-zinc-400">(opcional)</span></label><input id="purchase-reference" type="text" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value.slice(0, 120))} placeholder="Factura F001-123" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" /></div>
      </div></section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="text-base font-semibold">Productos</h2><form onSubmit={submitProductSearch} className="mt-4 flex gap-2"><label htmlFor="product-search" className="sr-only">Buscar producto por nombre o código de barras</label><input ref={productSearchRef} id="product-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o escanear código de barras" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" /><button type="submit" className="min-h-11 rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Agregar</button></form>{visibleProducts.length > 0 ? <div className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">{visibleProducts.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex min-h-12 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"><span><span className="block font-semibold">{product.name}</span><span className="text-xs text-zinc-500">{product.barcode ?? "Sin código"} · {product.unit_type === "UNIT" ? "UNIT" : "WEIGHT · kg"}</span></span><span className="text-xs font-semibold text-zinc-500">Agregar</span></button>)}</div> : null}<p className="mt-2 text-xs text-zinc-500">Solo se muestran productos activos. Si no existe, créalo primero en <Link href="/admin/products/new" className="font-medium underline">Productos</Link>.</p></section>

      <section className="space-y-3"><h2 className="text-base font-semibold">Líneas de compra</h2>{lines.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">Agrega productos para comenzar la compra.</div> : lines.map(({ product, ...line }) => { const fullLine = { product, ...line }; const effective = effectivePurchaseLine(fullLine); const highlighted = highlightedId === product.id; return <article id={`purchase-line-${product.id}`} key={product.id} className={`rounded-lg border bg-white p-4 ${highlighted ? "border-amber-400 ring-2 ring-amber-100" : "border-zinc-200"}`} onAnimationEnd={() => setHighlightedId(null)}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{product.name}</h3><p className="text-xs text-zinc-500">{product.unit_type === "UNIT" ? "UNIT · unidades" : "WEIGHT · kg"}{product.barcode ? ` · ${product.barcode}` : ""}</p></div><button type="button" onClick={() => setLines((current) => current.filter((item) => item.product.id !== product.id))} className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50" aria-label={`Quitar ${product.name}`}>Quitar</button></div>{product.unit_type === "UNIT" ? <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Modo de ingreso para ${product.name}`}><button type="button" onClick={() => switchToDirect(fullLine)} className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold ${line.entryMode === "UNIT" ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-700"}`}>Por unidad</button><button type="button" onClick={() => switchToPackage(fullLine)} className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold ${line.entryMode === "PACKAGE" ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-700"}`}>Caja / paquete</button></div> : null}{line.entryMode === "PACKAGE" && product.unit_type === "UNIT" ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm"><span className="font-medium text-zinc-700">Cajas/paquetes</span><input type="text" inputMode="numeric" value={line.packageQuantity} onChange={(event) => updateLine(product.id, { packageQuantity: sanitizeIntegerInput(event.target.value) })} className="rounded-md border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span className="font-medium text-zinc-700">Unidades por caja</span><input type="text" inputMode="numeric" value={line.unitsPerPackage} onChange={(event) => updateLine(product.id, { unitsPerPackage: sanitizeIntegerInput(event.target.value) })} className="rounded-md border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span className="font-medium text-zinc-700">Costo por caja (S/.)</span><input type="text" inputMode="decimal" value={line.packageCost} onChange={(event) => updateLine(product.id, { packageCost: sanitizePurchaseDecimal(event.target.value, 2) })} className="rounded-md border border-zinc-300 px-3 py-2" /></label></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-medium text-zinc-700">{product.unit_type === "UNIT" ? "Cantidad de unidades" : "Cantidad (kg)"}</span><input type="text" inputMode={product.unit_type === "UNIT" ? "numeric" : "decimal"} value={line.quantity} onChange={(event) => updateLine(product.id, { quantity: product.unit_type === "UNIT" ? sanitizeIntegerInput(event.target.value) : sanitizePurchaseDecimal(event.target.value, 3) })} className="rounded-md border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span className="font-medium text-zinc-700">{product.unit_type === "UNIT" ? "Costo por unidad (S/.)" : "Costo por kg (S/.)"}</span><input type="text" inputMode="decimal" value={line.unitPurchaseCost} onChange={(event) => updateLine(product.id, { unitPurchaseCost: sanitizePurchaseDecimal(event.target.value, 2) })} className="rounded-md border border-zinc-300 px-3 py-2" /></label></div>}{line.entryMode === "PACKAGE" && effective.error ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{effective.error}</p> : null}<dl className="mt-4 grid gap-2 border-t border-zinc-100 pt-3 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Ingreso al stock</dt><dd className="font-semibold">{effective.quantity ? `${effective.quantity}${product.unit_type === "WEIGHT" ? " kg" : " unidades"}` : "—"}</dd></div><div><dt className="text-zinc-500">Costo unitario</dt><dd className="font-semibold">{effective.unitCost ? `S/. ${effective.unitCost}` : "—"}</dd></div><div><dt className="text-zinc-500">Subtotal</dt><dd className="font-semibold">{money(effective.lineCents)}</dd></div></dl></article>; })}</section>

      <section className="sticky bottom-0 rounded-lg border border-zinc-200 bg-white p-5 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-zinc-500">Total de compra</p><p className="text-2xl font-black tabular-nums">S/. {formatCents(totalCents)}</p></div><button type="button" disabled={isPending || !supplierId || !purchaseDate || lines.length === 0} onClick={submitPurchase} className="min-h-12 rounded-md bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50">{isPending ? "Registrando…" : "Confirmar compra"}</button></div></section>
    </div>
  );
}
