"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmSale } from "@/features/pos/actions";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { addProduct, removeProduct, updateQuantity } from "@/features/pos/cart";
import { findByBarcode, searchProducts } from "@/features/pos/catalog";
import { searchPosCustomers } from "@/features/pos/customers";
import { parseSignedCents } from "@/features/customers/validation";
import type { CartLine, PaymentMethod, PosCustomer, PosProduct } from "@/features/pos/types";
import {
  decrementIntegerQuantity,
  formatCents,
  formatMoney,
  incrementIntegerQuantity,
  lineTotalCents,
  parseCents,
  parseThousandths,
  sanitizeDecimalInput,
} from "@/features/pos/money";

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
  if (message.includes("Customer not found")) {
    return "Cliente no encontrado. Solicita al administrador registrarlo.";
  }
  if (message.includes("Customer is inactive")) {
    return "El cliente está inactivo.";
  }
  if (message.includes("Customer credit is disabled")) {
    return "El crédito está deshabilitado para este cliente.";
  }
  if (message.includes("Credit limit exceeded")) {
    return "Crédito insuficiente para esta venta.";
  }
  if (message.includes("Customer is required only for FIADO")) {
    return "Selecciona un cliente para la venta fiada.";
  }
  if (message.includes("FIADO does not accept cash received")) {
    return "La venta fiada no usa monto recibido.";
  }
  if (message.includes("Customer access requires")) {
    return "No tienes acceso a clientes.";
  }
  if (message.includes("Open cash session is required")) {
    return "La caja está cerrada. Abre una caja para continuar.";
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

export function PosScreen({ sellerName, initialCashSessionOpen }: { sellerName: string; initialCashSessionOpen: boolean }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState(newClientKey);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<PosCustomer[]>([]);
  const [customerSearched, setCustomerSearched] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [cashSessionOpen, setCashSessionOpen] = useState(initialCashSessionOpen);
  const [isPending, startTransition] = useTransition();
  const productInputRef = useRef<HTMLInputElement>(null);

  const totalCents = cart.reduce((sum, line) => {
    const lineTotal = lineTotalCents(line.selling_price, line.quantity, line.unit_type);
    return lineTotal === null ? sum : sum + lineTotal;
  }, BigInt(0));
  const receivedCents = parseCents(amountReceived);
  const exactCashPayment = paymentMethod === "CASH" && amountReceived.trim() === "";
  const changeCents = exactCashPayment ? BigInt(0) : receivedCents === null ? null : receivedCents - totalCents;
  const availableCreditCents =
    selectedCustomer === null ? null : parseSignedCents(selectedCustomer.available_credit);
  const customerUsable =
    selectedCustomer !== null && selectedCustomer.active && selectedCustomer.credit_enabled;
  const creditOk =
    customerUsable && availableCreditCents !== null && totalCents <= availableCreditCents;
  const canConfirm =
    cart.length > 0 &&
    cart.every((line) => {
      const quantity = parseThousandths(line.quantity);
      return quantity !== null && quantity > BigInt(0) &&
        (line.unit_type === "WEIGHT" || quantity % BigInt(1000) === BigInt(0));
    }) &&
    (paymentMethod === "YAPE" ||
      paymentMethod === "CREDIT" ||
      (exactCashPayment || (receivedCents !== null && receivedCents >= totalCents))) &&
    (paymentMethod !== "CREDIT" || creditOk);

  useEffect(() => {
    if (cashSessionOpen) productInputRef.current?.focus();
  }, [cashSessionOpen]);

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

  useEffect(() => {
    let cancelled = false;
    const term = customerQuery.trim();
    if (!customerOpen) return;

    const timer = window.setTimeout(async () => {
      try {
        const customers = await searchPosCustomers(term);
        if (!cancelled) {
          setCustomerResults(customers);
          setCustomerSearched(true);
          setCustomerLoading(false);
        }
      } catch {
        if (!cancelled) {
          setCustomerResults([]);
          setCustomerSearched(false);
          setCustomerLoading(false);
          setCustomerError("No se pudieron cargar los clientes. Intenta de nuevo.");
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerOpen, customerQuery]);

  function resetCustomer(open = false) {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerSearched(false);
    setCustomerError("");
    setCustomerLoading(open);
    setCustomerOpen(open);
  }

  function selectCustomer(customer: PosCustomer) {
    setSelectedCustomer(customer);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerSearched(false);
    setCustomerError("");
    setCustomerLoading(false);
    setCustomerOpen(false);
  }

  function keepScannerReady() {
    setQuery("");
    setResults([]);
    window.setTimeout(() => productInputRef.current?.focus(), 0);
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

  function submitSale() {
    if (!canConfirm || isPending) return;

    const input = {
      client_key: clientKey,
      payment_method: paymentMethod,
      items: cart.map((line) => ({ product_id: line.id, quantity: line.quantity })),
      amount_received: paymentMethod === "CASH"
        ? exactCashPayment
          ? formatCents(totalCents)
          : amountReceived
        : null,
      customer_id: paymentMethod === "CREDIT" && selectedCustomer !== null ? selectedCustomer.id : null,
    } as const;

    startTransition(async () => {
      const result = await confirmSale(input);
      if (!result.ok) {
        const sessionRequired = result.error.includes("Open cash session is required");
        setMessage(toPosErrorMessage(result.error));
        if (sessionRequired) {
          setCashSessionOpen(false);
          try {
            const current = await getCurrentCashSessionState();
            setCashSessionOpen(current.kind === "OPEN");
          } catch (error) {
            console.error(error);
          }
        }
        productInputRef.current?.focus();
        return;
      }

      const total = formatMoney(result.sale.total);
      setSuccess(`Venta confirmada · ${total}`);
      setCart([]);
      setAmountReceived("");
      setPaymentMethod("CASH");
      resetCustomer();
      setMessage("");
      setClientKey(newClientKey());
      window.setTimeout(() => {
        setSuccess(null);
        productInputRef.current?.focus();
      }, 1200);
    });
  }

  if (!cashSessionOpen) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-950">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div>
              <p className="text-lg font-bold tracking-tight">Punto de venta</p>
              <p className="text-xs text-slate-500">{sellerName}</p>
            </div>
            <Link href="/cash" className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              Caja
            </Link>
          </div>
        </header>
        <section className="mx-auto flex min-h-[calc(100vh-73px)] max-w-xl items-center px-4 py-8">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-2xl font-black">Caja cerrada</p>
            <p className="mt-3 text-slate-600">Debes abrir caja antes de realizar ventas.</p>
            <Link href="/cash" className="mt-6 inline-flex min-h-14 items-center rounded-xl bg-blue-600 px-6 text-lg font-black text-white hover:bg-blue-700">
              Abrir caja
            </Link>
          </div>
        </section>
      </main>
    );
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
                  const lineTotal = lineTotalCents(line.selling_price, line.quantity, line.unit_type);
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
                            <label className="flex h-12 items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-2 focus-within:border-blue-500 focus-within:bg-blue-50 focus-within:ring-4 focus-within:ring-blue-100">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.quantity}
                                onChange={(event) => {
                                  const next = sanitizeDecimalInput(event.target.value, 3);
                                  setCart((current) => updateQuantity(current, line.id, next));
                                }}
                                autoComplete="off"
                                placeholder="0.000"
                                aria-label={`Peso de ${line.name}`}
                                className="w-20 bg-transparent text-right text-lg font-bold tabular-nums text-slate-950 outline-none placeholder:text-slate-400"
                              />
                              <span className="text-sm font-semibold text-slate-600">kg</span>
                            </label>
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
                          }}
                          aria-label={`Quitar ${line.name} del carrito`}
                          title={`Quitar ${line.name} del carrito`}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-9 0V5a1 1 0 011-1h2a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7m3 4v6m4-6v6" />
                          </svg>
                        </button>
                      </div>
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

          <div className="mt-6 grid grid-cols-3 gap-3">
            {(["CASH", "YAPE", "CREDIT"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPaymentMethod(method);
                  if (method === "YAPE") {
                    setAmountReceived("");
                  }
                   if (method !== "CREDIT") {
                     resetCustomer(false);
                   }
                }}
                className={`min-h-14 rounded-xl text-lg font-bold ${paymentMethod === method ? "bg-blue-600 text-white shadow-sm" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {method === "CASH" ? "EFECTIVO" : method === "YAPE" ? "YAPE" : "FIADO"}
              </button>
            ))}
          </div>

           {paymentMethod === "CREDIT" ? (
             <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
               <label htmlFor="customer-search" className="block text-sm font-semibold text-amber-900">
                 Buscar o seleccionar cliente
               </label>
               <input
                 id="customer-search"
                 type="search"
                 value={customerQuery}
                 onChange={(event) => {
                   setCustomerQuery(event.target.value);
                   setCustomerOpen(true);
                   setCustomerLoading(true);
                   setCustomerSearched(false);
                   setCustomerError("");
                 }}
                 onFocus={() => {
                   setCustomerOpen(true);
                   setCustomerLoading(true);
                   setCustomerSearched(false);
                   setCustomerError("");
                 }}
                 autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                 placeholder="Nombre o teléfono"
                 className="mt-2 h-14 w-full rounded-xl border-2 border-amber-300 bg-white px-4 text-base outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
               />

               {customerOpen && customerLoading ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                   Cargando clientes...
                 </p>
               ) : null}

               {customerOpen && !customerLoading && customerError ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-red-700">
                   {customerError}
                 </p>
               ) : null}

               {customerOpen && !customerLoading && !customerError && customerResults.length > 0 ? (
                 <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                   {customerResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-left hover:border-amber-400 hover:bg-amber-100"
                    >
                       <span className="min-w-0">
                         <span className="block truncate font-semibold">{customer.name}</span>
                         <span className="text-xs text-slate-500">
                           {customer.phone ?? "Sin teléfono"}
                         </span>
                       </span>
                     </button>
                   ))}
                 </div>
               ) : null}

               {customerOpen && !customerLoading && !customerError && customerSearched && customerResults.length === 0 ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                   No se encontraron clientes.
                   {customerQuery.trim() ? " Solicita al administrador registrarlo." : ""}
                 </p>
               ) : null}

              {selectedCustomer === null && !customerSearched ? (
                <p className="mt-2 text-sm text-amber-900">Selecciona un cliente para vender fiado.</p>
              ) : null}

              {selectedCustomer !== null ? (
                <div className="mt-3 rounded-xl border border-amber-300 bg-white p-3">
                   <div className="flex items-center justify-between gap-3">
                     <p className="min-w-0 truncate font-bold">{selectedCustomer.name}</p>
                     <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                       onClick={() => resetCustomer(true)}
                      className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                    >
                      Cambiar
                    </button>
                   </div>
                   <dl className="mt-2 space-y-1 text-sm">
                     <div className="flex items-center justify-between">
                       <dt className="text-slate-600">Nombre</dt>
                       <dd className="max-w-[65%] truncate font-semibold">{selectedCustomer.name}</dd>
                     </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Deuda actual</dt>
                      <dd className="font-semibold">{formatMoney(selectedCustomer.current_debt)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Límite</dt>
                      <dd className="font-semibold">{formatMoney(selectedCustomer.credit_limit)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Disponible</dt>
                      <dd className="font-bold">{formatMoney(selectedCustomer.available_credit)}</dd>
                    </div>
                  </dl>
                  {!selectedCustomer.active ? (
                    <p className="mt-2 text-sm font-semibold text-red-700">El cliente está inactivo.</p>
                  ) : null}
                  {selectedCustomer.active && !selectedCustomer.credit_enabled ? (
                    <p className="mt-2 text-sm font-semibold text-red-700">
                      Crédito deshabilitado para este cliente.
                    </p>
                  ) : null}
                  {customerUsable && availableCreditCents !== null && totalCents > availableCreditCents ? (
                    <p className="mt-2 text-sm font-semibold text-red-700">
                      Crédito insuficiente. Disponible: {formatMoney(selectedCustomer.available_credit)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {paymentMethod === "CASH" ? (
            <div className="mt-5 space-y-3">
              <label htmlFor="amount-received" className="block text-sm font-semibold text-slate-700">
                Monto recibido (opcional)
              </label>
              <div className="relative">
                <input
                  id="amount-received"
                  type="text"
                  inputMode="decimal"
                  value={amountReceived}
                  onChange={(event) =>
                    setAmountReceived(sanitizeDecimalInput(event.target.value, 2))
                  }
                  autoComplete="off"
                  placeholder="0.00"
                  className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 pr-14 text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  S/.
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
                <span className="font-semibold">Vuelto</span>
                <span className="text-xl font-black">{changeCents !== null && changeCents >= BigInt(0) ? `S/. ${formatCents(changeCents)}` : "—"}</span>
              </div>
              <p className="text-xs text-slate-500">Déjalo vacío si paga exacto.</p>
            </div>
          ) : paymentMethod === "YAPE" ? (
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Verifica el pago en Yape y luego confirma.</p>
          ) : null}

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
