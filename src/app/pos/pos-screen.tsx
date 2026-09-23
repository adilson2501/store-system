"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmSale } from "@/features/pos/actions";
import { addProduct, removeProduct, updateQuantity } from "@/features/pos/cart";
import { findByBarcode, searchProducts } from "@/features/pos/catalog";
import {
  decrementIntegerQuantity,
  formatCents,
  formatMoney,
  incrementIntegerQuantity,
  lineTotalCents,
  parseCents,
  parseThousandths,
} from "@/features/pos/money";
import type { CartLine, PaymentMethod, PosProduct } from "@/features/pos/types";
import { NumericKeypad } from "@/app/pos/numeric-keypad";

function newClientKey() {
  return crypto.randomUUID();
}

function toPosErrorMessage(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (message === "Authentication required") {
    return "Autenticación requerida.";
  }
  if (message.includes("POS access requires")) {
    return "El acceso al POS requiere rol ADMIN o SELLER.";
  }
  if (message === "Product not found") {
    return "Producto no encontrado.";
  }
  if (message === "Product is inactive or unavailable") {
    return "Producto inactivo o no disponible.";
  }
  const stock = message.match(/^Insufficient stock for product (.+)$/);
  if (stock) {
    return `Stock insuficiente para ${stock[1]}.`;
  }
  if (message.includes("Quantity must be positive")) {
    return "La cantidad debe ser positiva con máximo 3 decimales.";
  }
  if (message.includes("UNIT products require whole-number")) {
    return "Los productos UNIT requieren cantidades enteras.";
  }
  if (message.includes("Cash received must be at least")) {
    return "El monto recibido debe ser igual o mayor al total.";
  }
  if (message.includes("YAPE does not accept cash received")) {
    return "YAPE no acepta monto en efectivo.";
  }
  if (message.includes("At least one sale item")) {
    return "Agrega al menos un producto.";
  }
  if (message.includes("Unsupported payment method")) {
    return "Método de pago no admitido.";
  }
  if (message.includes("sales_client_key_unique_idx")) {
    return "Esta venta ya fue registrada.";
  }

  return message;
}

type ActiveNumeric =
  | { kind: "weight"; lineId: string }
  | { kind: "received" }
  | null;

export function PosScreen({ sellerName }: { sellerName: string }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [activeNumeric, setActiveNumeric] = useState<ActiveNumeric>(null);
  const [isPending, startTransition] = useTransition();
  const productInputRef = useRef<HTMLInputElement>(null);

  const totalCents = cart.reduce((sum, line) => {
    const lineTotal = lineTotalCents(line.selling_price, line.quantity);
    return lineTotal === null ? sum : sum + lineTotal;
  }, BigInt(0));
  const receivedCents = parseCents(amountReceived);
  const changeCents = receivedCents === null ? null : receivedCents - totalCents;
  const canConfirm =
    cart.length > 0 &&
    cart.every((line) => {
      const quantity = parseThousandths(line.quantity);
      return quantity !== null && quantity > BigInt(0) &&
        (line.unit_type === "WEIGHT" || quantity % BigInt(1000) === BigInt(0));
    }) &&
    (paymentMethod === "YAPE" || (receivedCents !== null && receivedCents >= totalCents));

  const activeWeightLine =
    activeNumeric?.kind === "weight"
      ? cart.find((line) => line.id === activeNumeric.lineId)
      : undefined;

  useEffect(() => {
    productInputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (!term) return;

    const timer = window.setTimeout(async () => {
      try {
        const products = await searchProducts(term);
        if (!cancelled) setResults(products);
      } catch {
        if (!cancelled) setMessage("No se pudo buscar productos.");
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function keepScannerReady() {
    setQuery("");
    setResults([]);
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function closeKeypadAndScan() {
    setActiveNumeric(null);
    keepScannerReady();
  }

  function putProductInCart(product: PosProduct) {
    if (!product.is_active) {
      setMessage("Producto inactivo.");
      keepScannerReady();
      return;
    }

    setCart((current) => addProduct(current, product));
    setQuery("");
    setResults([]);
    setMessage("");

    if (product.unit_type === "WEIGHT") {
      setActiveNumeric({ kind: "weight", lineId: product.id });
      window.setTimeout(() => productInputRef.current?.focus(), 0);
      return;
    }

    setActiveNumeric(null);
    keepScannerReady();
  }

  async function handleProductSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;

    setQuery("");
    setResults([]);

    try {
      const product = await findByBarcode(value);
      if (!product) {
        setMessage("Código no encontrado.");
        keepScannerReady();
        return;
      }
      putProductInCart(product);
    } catch {
      setMessage("No se pudo leer el código.");
      keepScannerReady();
    }
  }

  function activateWeight(lineId: string) {
    setActiveNumeric({ kind: "weight", lineId });
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function activateReceived() {
    setActiveNumeric({ kind: "received" });
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  }

  function handleReceivedKey(next: string) {
    setAmountReceived(next);
  }

  function submitSale() {
    if (!canConfirm || isPending) return;

    const clientKey = newClientKey();
    const input = {
      client_key: clientKey,
      payment_method: paymentMethod,
      items: cart.map((line) => ({ product_id: line.id, quantity: line.quantity })),
      amount_received: paymentMethod === "CASH" ? amountReceived : null,
    } as const;

    startTransition(async () => {
      const result = await confirmSale(input);
      if (!result.ok) {
        setMessage(toPosErrorMessage(result.error));
        productInputRef.current?.focus();
        return;
      }

      const total = formatMoney(result.sale.total);
      setSuccess(`Venta confirmada · ${total}`);
      setCart([]);
      setAmountReceived("");
      setPaymentMethod("CASH");
      setActiveNumeric(null);
      setMessage("");
      window.setTimeout(() => {
        setSuccess(null);
        productInputRef.current?.focus();
      }, 1200);
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-lg font-bold tracking-tight">Punto de venta</p>
            <p className="text-xs text-slate-500">{sellerName}</p>
          </div>
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Salir del POS
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <form onSubmit={handleProductSubmit} className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
            <label htmlFor="product-input" className="mb-2 block text-sm font-semibold text-slate-700">
              Buscar o escanear producto
            </label>
            <input
              ref={productInputRef}
              id="product-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!event.target.value.trim()) setResults([]);
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              placeholder="Escanea un código o busca un producto"
              className="h-14 w-full rounded-xl border-2 border-blue-500 px-4 text-xl outline-none focus:ring-4 focus:ring-blue-100"
            />
            {results.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {results.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!product.is_active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => putProductInCart(product)}
                    className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-semibold">{product.name}</span>
                      <span className="text-xs text-slate-500">
                        {product.unit_type === "WEIGHT" ? "kg" : "unidad"} · stock {product.stock_quantity}
                      </span>
                    </span>
                    <span className="font-semibold">{formatMoney(product.selling_price)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-2 min-h-5 text-sm text-slate-500" aria-live="polite">
              {message}
            </p>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <h1 className="text-lg font-bold">Carrito</h1>
              <span className="text-sm text-slate-500">
                {cart.length} {cart.length === 1 ? "producto" : "productos"}
              </span>
            </div>
            {cart.length === 0 ? (
              <p className="px-4 py-12 text-center text-slate-500">Escanea o busca un producto para comenzar.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {cart.map((line) => {
                  const lineTotal = lineTotalCents(line.selling_price, line.quantity);
                  const weightActive = activeNumeric?.kind === "weight" && activeNumeric.lineId === line.id;
                  return (
                    <div key={line.id} className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{line.name}</p>
                          <p className="text-sm text-slate-500">{formatMoney(line.selling_price)} / {line.unit_type === "WEIGHT" ? "kg" : "unidad"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {line.unit_type === "UNIT" ? (
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() =>
                                setCart((current) =>
                                  updateQuantity(current, line.id, decrementIntegerQuantity(line.quantity)),
                                )
                              }
                              className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold hover:bg-slate-50"
                              aria-label={`Reducir ${line.name}`}
                            >
                              −
                            </button>
                          ) : null}

                          {line.unit_type === "UNIT" ? (
                            <span className="flex h-12 w-16 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold tabular-nums">
                              {line.quantity}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => activateWeight(line.id)}
                              className={`flex h-12 min-w-28 items-center justify-center gap-1 rounded-xl border-2 px-3 text-lg font-bold tabular-nums ${
                                weightActive
                                  ? "border-blue-500 bg-blue-50 text-blue-900 ring-4 ring-blue-100"
                                  : "border-slate-300 bg-white hover:border-blue-400"
                              }`}
                              aria-label={`Peso de ${line.name}`}
                              aria-pressed={weightActive}
                            >
                              <span>{line.quantity || "0"}</span>
                              <span className="text-sm font-semibold text-slate-600">kg</span>
                            </button>
                          )}

                          {line.unit_type === "UNIT" ? (
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() =>
                                setCart((current) =>
                                  updateQuantity(current, line.id, incrementIntegerQuantity(line.quantity)),
                                )
                              }
                              className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold hover:bg-slate-50"
                              aria-label={`Aumentar ${line.name}`}
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                        <div className="w-24 text-right font-bold">{lineTotal === null ? "—" : formatMoney(formatCents(lineTotal))}</div>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setCart((current) => removeProduct(current, line.id));
                            if (activeNumeric?.kind === "weight" && activeNumeric.lineId === line.id) {
                              setActiveNumeric(null);
                            }
                          }}
                          className="rounded-lg px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </div>

                      {weightActive && activeWeightLine ? (
                        <div className="mt-3">
                          <NumericKeypad
                            value={activeWeightLine.quantity}
                            onChange={(next) =>
                              setCart((current) =>
                                current.map((item) =>
                                  item.id === activeWeightLine.id
                                    ? { ...item, quantity: next }
                                    : item,
                                ),
                              )
                            }
                            maxDecimals={3}
                            label={`Peso · ${activeWeightLine.name}`}
                            displaySuffix="kg"
                            onDone={closeKeypadAndScan}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-5xl font-black tracking-tight">S/. {formatCents(totalCents)}</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(["CASH", "YAPE"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPaymentMethod(method);
                  if (method === "YAPE") {
                    setAmountReceived("");
                    setActiveNumeric((current) =>
                      current?.kind === "received" ? null : current,
                    );
                  }
                }}
                className={`min-h-14 rounded-xl text-lg font-bold ${paymentMethod === method ? "bg-blue-600 text-white shadow-sm" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {method === "CASH" ? "EFECTIVO" : "YAPE"}
              </button>
            ))}
          </div>

          {paymentMethod === "CASH" ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Monto recibido</p>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={activateReceived}
                className={`flex h-14 w-full items-center justify-between rounded-xl border-2 px-4 text-2xl font-bold tabular-nums ${
                  activeNumeric?.kind === "received"
                    ? "border-blue-500 bg-blue-50 text-blue-950 ring-4 ring-blue-100"
                    : "border-slate-300 bg-white text-slate-900 hover:border-blue-400"
                }`}
                aria-label="Monto recibido"
                aria-pressed={activeNumeric?.kind === "received"}
              >
                <span>{amountReceived || "0.00"}</span>
                <span className="text-sm font-semibold text-slate-500">S/.</span>
              </button>

              {activeNumeric?.kind === "received" ? (
                <NumericKeypad
                  value={amountReceived}
                  onChange={handleReceivedKey}
                  maxDecimals={2}
                  label="Monto recibido"
                  displaySuffix="S/."
                  onDone={closeKeypadAndScan}
                />
              ) : null}

              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
                <span className="font-semibold">Vuelto</span>
                <span className="text-xl font-black">{changeCents !== null && changeCents >= BigInt(0) ? `S/. ${formatCents(changeCents)}` : "—"}</span>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Verifica el pago en Yape y luego confirma.</p>
          )}

          {success ? <p className="mt-5 rounded-xl bg-emerald-100 px-4 py-3 text-center font-bold text-emerald-900" role="status">{success}</p> : null}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={submitSale}
            disabled={!canConfirm || isPending}
            className="mt-5 min-h-16 w-full rounded-xl bg-emerald-600 px-4 text-xl font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? "Confirmando…" : "Confirmar venta"}
          </button>
        </aside>
      </div>
    </main>
  );
}
