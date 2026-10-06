"use client";

import { useEffect, useState, useTransition } from "react";
import { registerCustomerPaymentForPos } from "@/features/customers/actions";
import { parseSignedCents, formatCustomerMoney } from "@/features/customers/validation";
import { getPosCustomer, searchPosCustomers } from "@/features/pos/customers";
import { parseCents, sanitizeDecimalInput } from "@/features/pos/money";
import type { PaymentMethod, PosCustomer } from "@/features/pos/types";

function newClientKey() {
  return crypto.randomUUID();
}

export function CustomerCollection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [clientKey, setClientKey] = useState(newClientKey);
  const [isPending, startTransition] = useTransition();

  const debtCents = selectedCustomer === null ? null : parseSignedCents(selectedCustomer.current_debt);
  const amountCents = parseCents(amount);
  const amountTooHigh = debtCents !== null && amountCents !== null && amountCents > debtCents;
  const amountInvalid = amount.length > 0 && (amountCents === null || amountCents <= BigInt(0));
  const noDebt = debtCents === BigInt(0);
  const canSubmit = selectedCustomer !== null
    && !noDebt
    && amountCents !== null
    && amountCents > BigInt(0)
    && !amountTooHigh
    && !isPending;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const customers = await searchPosCustomers(query);
        if (!cancelled) {
          setResults(customers);
          setSearched(true);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setResults([]);
          setSearched(false);
          setLoading(false);
          setSearchError("No se pudieron cargar los clientes. Intenta de nuevo.");
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function openSelector() {
    setOpen(true);
    setLoading(true);
    setSearched(false);
    setSearchError("");
  }

  function selectCustomer(customer: PosCustomer) {
    setSelectedCustomer(customer);
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearchError("");
    setOpen(false);
    setAmount("");
    setPaymentError("");
    setPaymentSuccess("");
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearchError("");
    setOpen(true);
    setLoading(true);
    setAmount("");
    setPaymentError("");
    setPaymentSuccess("");
  }

  function submitPayment() {
    if (!canSubmit || selectedCustomer === null || amountCents === null) return;

    setPaymentError("");
    setPaymentSuccess("");
    const input = {
      customerId: selectedCustomer.id,
      amount,
      paymentMethod: paymentMethod === "YAPE" ? "YAPE" : "CASH",
      note: "",
      clientKey,
    } as const;

    startTransition(async () => {
      const result = await registerCustomerPaymentForPos(input);
      if (result.error) {
        setPaymentError(result.error);
        return;
      }

      try {
        const refreshed = await getPosCustomer(selectedCustomer.id);
        setSelectedCustomer(refreshed);
        setAmount("");
        setClientKey(newClientKey());
        setPaymentSuccess("Pago registrado correctamente.");
      } catch (error) {
        console.error(error);
        setPaymentSuccess("Pago registrado, pero no se pudo actualizar la deuda. Vuelve a seleccionar el cliente.");
        setClientKey(newClientKey());
      }
    });
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
        <label htmlFor="customer-collection-search" className="block text-sm font-semibold text-zinc-700">
          Buscar o seleccionar cliente
        </label>
        <input
          id="customer-collection-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setLoading(true);
            setSearched(false);
            setSearchError("");
          }}
          onFocus={openSelector}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Nombre o teléfono"
          className="mt-2 h-14 w-full rounded-xl border-2 border-blue-500 bg-white px-4 text-lg text-zinc-900 outline-none focus:ring-4 focus:ring-blue-100"
        />

        {open && loading ? (
          <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-4 text-sm font-semibold text-zinc-600">Cargando clientes...</p>
        ) : null}
        {open && !loading && searchError ? (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">{searchError}</p>
        ) : null}
        {open && !loading && !searchError && results.length > 0 ? (
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCustomer(customer)}
                className="flex min-h-16 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  <span className="text-sm text-zinc-500">{customer.phone ?? "Sin teléfono"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {open && !loading && !searchError && searched && results.length === 0 ? (
          <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-4 text-sm font-semibold text-zinc-600">
            No se encontraron clientes.{query.trim() ? " Solicita al administrador registrarlo." : ""}
          </p>
        ) : null}
      </div>

      {selectedCustomer !== null ? (
        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cliente seleccionado</p>
              <h2 className="mt-1 truncate text-xl font-bold">{selectedCustomer.name}</h2>
              <p className="mt-1 text-sm text-zinc-600">{selectedCustomer.phone ?? "Sin teléfono"}</p>
            </div>
            <button type="button" onClick={clearCustomer} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              Cambiar
            </button>
          </div>

          <div className="mt-5 rounded-xl bg-zinc-50 p-4">
            <p className="text-sm text-zinc-600">Deuda actual</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{formatCustomerMoney(debtCents ?? BigInt(0))}</p>
            {noDebt ? <p className="mt-2 font-semibold text-emerald-700">Sin deuda pendiente</p> : null}
          </div>

          {!noDebt ? (
            <div className="mt-5 space-y-4">
              <h3 className="text-lg font-bold">Registrar pago</h3>
              {paymentError ? <p className="rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-700" role="alert">{paymentError}</p> : null}
              {paymentSuccess ? <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">{paymentSuccess}</p> : null}
              <div>
                <label htmlFor="collection-amount" className="block text-sm font-semibold text-zinc-700">Monto pagado</label>
                <input
                  id="collection-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value, 2))}
                  disabled={isPending}
                  autoComplete="off"
                  placeholder="0.00"
                  className="mt-2 h-14 w-full rounded-xl border-2 border-zinc-300 px-4 text-2xl font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-zinc-100"
                />
                {amountTooHigh ? <p className="mt-2 text-sm font-semibold text-red-700">El pago no puede superar la deuda actual.</p> : null}
                {amountInvalid ? <p className="mt-2 text-sm font-semibold text-red-700">El monto debe ser mayor que cero y tener máximo 2 decimales.</p> : null}
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-zinc-700">Medio de pago</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(["CASH", "YAPE"] as const).map((method) => (
                    <label key={method} className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-base font-bold ${paymentMethod === method ? "border-blue-600 bg-blue-50 text-blue-800" : "border-zinc-300 text-zinc-700"}`}>
                      <input type="radio" name="collection-payment-method" value={method} checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} disabled={isPending} className="sr-only" />
                      {method === "CASH" ? "EFECTIVO" : "YAPE"}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="button" onClick={submitPayment} disabled={!canSubmit} className="min-h-14 w-full rounded-xl bg-emerald-600 px-4 text-lg font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
                {isPending ? "Registrando…" : "Registrar pago"}
              </button>
            </div>
          ) : null}
          {noDebt && paymentError ? <p className="mt-5 rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-700" role="alert">{paymentError}</p> : null}
          {noDebt && paymentSuccess ? <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">{paymentSuccess}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
