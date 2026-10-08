"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { registerCustomerPaymentForPos } from "@/features/customers/actions";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { formatCustomerMoney, parseSignedCents } from "@/features/customers/validation";
import { getPosCustomer, searchPosCustomers } from "@/features/pos/customers";
import { formatCents, parseCents, sanitizeDecimalInput } from "@/features/pos/money";
import type { PaymentMethod, PosCustomer } from "@/features/pos/types";

type PaymentSuccess = {
  amount: string;
  method: PaymentMethod;
  remainingDebt: bigint | null;
  refreshFailed: boolean;
};

function newClientKey() {
  return crypto.randomUUID();
}

function methodLabel(method: PaymentMethod) {
  return method === "YAPE" ? "Yape" : "Efectivo";
}

function formatInputMoney(value: string) {
  const cents = parseCents(value);
  return cents === null ? "S/. 0.00" : `S/. ${formatCents(cents)}`;
}

function displayPaymentError(error: string) {
  if (error.includes("superar la deuda")) return error;
  if (error.includes("Debes abrir caja")) return error;
  if (error.includes("inactivo")) return "No se puede registrar el pago de un cliente inactivo.";
  if (error.includes("ya fue usada")) return "No se pudo registrar el pago. Revisa el estado del cliente e inténtalo nuevamente.";
  if (error.includes("positivo") || error.includes("máximo 2 decimales")) return error;
  return "No se pudo registrar el pago.";
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-bold text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-black tabular-nums" : "font-semibold tabular-nums"}>{formatCustomerMoney(parseSignedCents(value))}</dd>
    </div>
  );
}

function CustomerResult({ customer, onSelect }: { customer: PosCustomer; onSelect: () => void }) {
  const debt = parseSignedCents(customer.current_debt);
  const hasDebt = debt > BigInt(0);

  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className="flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-bold text-foreground">{customer.name}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{customer.phone ?? "Sin teléfono"}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Deuda</span>
        <span className={`mt-1 block font-black tabular-nums ${hasDebt ? "text-foreground" : "text-success"}`}>
          {hasDebt ? formatCustomerMoney(debt) : "Sin deuda"}
        </span>
        {!customer.credit_enabled ? <span className="mt-1 block text-xs font-semibold text-warning-foreground">Crédito deshabilitado</span> : null}
      </span>
    </button>
  );
}

function CashSessionNotice() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning-foreground">
      <p className="font-bold">Necesitas una caja abierta para registrar pagos.</p>
      <Link href="/cash" className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-warning px-4 text-sm font-black text-warning-foreground hover:brightness-95">
        Ir a Caja
      </Link>
    </div>
  );
}

function PaymentSuccessMessage({ success }: { success: PaymentSuccess }) {
  if (success.refreshFailed) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground" role="status">
        <p className="font-bold">El pago fue registrado, pero no se pudo actualizar la deuda.</p>
        <p className="mt-2">Monto: <span className="font-bold">{formatInputMoney(success.amount)}</span> · Método: <span className="font-bold">{methodLabel(success.method)}</span></p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-4 text-success" role="status">
      <p className="text-lg font-black">Pago registrado</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="opacity-80">Monto</dt><dd className="font-black tabular-nums">{formatInputMoney(success.amount)}</dd></div>
        <div><dt className="opacity-80">Método</dt><dd className="font-black">{methodLabel(success.method)}</dd></div>
        <div><dt className="opacity-80">Deuda restante</dt><dd className="font-black tabular-nums">{success.remainingDebt === null ? "—" : formatCustomerMoney(success.remainingDebt)}</dd></div>
      </dl>
    </div>
  );
}

export function CustomerCollection({ initialCashSessionOpen }: { initialCashSessionOpen: boolean | null }) {
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
  const [paymentSuccess, setPaymentSuccess] = useState<PaymentSuccess | null>(null);
  const [clientKey, setClientKey] = useState(newClientKey);
  const [cashSessionOpen, setCashSessionOpen] = useState<boolean | null>(initialCashSessionOpen);
  const [isPending, startTransition] = useTransition();

  const debtCents = selectedCustomer === null ? null : parseSignedCents(selectedCustomer.current_debt);
  const amountCents = parseCents(amount);
  const amountTooHigh = debtCents !== null && amountCents !== null && amountCents > debtCents;
  const amountInvalid = amount.length > 0 && (amountCents === null || amountCents <= BigInt(0));
  const noDebt = debtCents === BigInt(0);
  const inactive = selectedCustomer?.active === false;
  const canSubmit = selectedCustomer !== null
    && !inactive
    && !noDebt
    && amountCents !== null
    && amountCents > BigInt(0)
    && !amountTooHigh
    && cashSessionOpen === true
    && !isPending;

  useEffect(() => {
    let cancelled = false;
    getCurrentCashSessionState()
      .then((current) => {
        if (!cancelled) setCashSessionOpen(current.kind === "OPEN");
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setCashSessionOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          setSearchError("No se pudieron cargar los clientes.");
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
    setPaymentSuccess(null);
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
    setPaymentSuccess(null);
  }

  function submitPayment() {
    if (!canSubmit || selectedCustomer === null || amountCents === null) return;

    setPaymentError("");
    setPaymentSuccess(null);
    const input = {
      customerId: selectedCustomer.id,
      amount,
      paymentMethod: paymentMethod === "YAPE" ? "YAPE" : "CASH",
      note: "",
      clientKey,
    } as const;
    const submittedAmount = amount;
    const submittedMethod = paymentMethod;

    startTransition(async () => {
      const result = await registerCustomerPaymentForPos(input);
      if (result.error) {
        setPaymentError(displayPaymentError(result.error));
        if (result.error.includes("Debes abrir caja")) setCashSessionOpen(false);
        return;
      }

      try {
        const refreshed = await getPosCustomer(selectedCustomer.id);
        setSelectedCustomer(refreshed);
        setAmount("");
        setClientKey(newClientKey());
        setPaymentSuccess({
          amount: submittedAmount,
          method: submittedMethod,
          remainingDebt: parseSignedCents(refreshed.current_debt),
          refreshFailed: false,
        });
      } catch (error) {
        console.error(error);
        setPaymentSuccess({ amount: submittedAmount, method: submittedMethod, remainingDebt: null, refreshFailed: true });
        setClientKey(newClientKey());
      }
    });
  }

  return (
    <section className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="customer-search-title">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Buscar cliente</p>
          <h2 id="customer-search-title" className="mt-1 text-xl font-black">Encuentra al cliente para consultar su deuda</h2>
        </div>
        <label htmlFor="customer-collection-search" className="sr-only">Buscar cliente por nombre o teléfono</label>
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
          className="mt-5 h-16 w-full rounded-xl border-2 border-primary bg-background px-4 text-lg text-foreground outline-none focus:ring-4 focus:ring-primary/15"
        />

        {open && loading ? <p className="mt-3 rounded-xl bg-muted px-4 py-4 text-sm font-bold text-muted-foreground">Buscando clientes…</p> : null}
        {open && !loading && searchError ? <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm font-bold text-destructive" role="alert">{searchError}</p> : null}
        {open && !loading && !searchError && results.length > 0 ? (
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto" aria-label="Resultados de clientes">
            {results.map((customer) => <CustomerResult key={customer.id} customer={customer} onSelect={() => selectCustomer(customer)} />)}
          </div>
        ) : null}
        {open && !loading && !searchError && searched && results.length === 0 ? <p className="mt-3 rounded-xl bg-muted px-4 py-4 text-sm font-bold text-muted-foreground">No encontramos clientes con esa búsqueda.</p> : null}
      </section>

      {selectedCustomer !== null ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)] lg:items-start">
          <section className="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm sm:p-6" aria-labelledby="selected-customer-title">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Cliente seleccionado</p>
                <h2 id="selected-customer-title" className="mt-2 truncate text-2xl font-black">{selectedCustomer.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedCustomer.phone ?? "Sin teléfono"}</p>
              </div>
              <button type="button" onClick={clearCustomer} className="min-h-12 shrink-0 rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted">Cambiar cliente</button>
            </div>

            {inactive ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">Este cliente está inactivo y no puede recibir pagos.</p> : null}
            {!selectedCustomer.credit_enabled ? <p className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-bold text-warning-foreground">Crédito deshabilitado. Esto no impide registrar pagos de una deuda existente.</p> : null}

            <div className="mt-5 rounded-2xl bg-primary/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Deuda actual</p>
              <p className="mt-2 text-4xl font-black tracking-tight tabular-nums">{formatCustomerMoney(debtCents ?? BigInt(0))}</p>
              {noDebt ? <p className="mt-2 font-bold text-success">Sin deuda pendiente</p> : null}
            </div>
            <dl className="mt-5 space-y-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <SummaryLine label="Límite de crédito" value={selectedCustomer.credit_limit} />
              <SummaryLine label="Crédito disponible" value={selectedCustomer.available_credit} />
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="payment-title">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Cobranza</p>
            <h2 id="payment-title" className="mt-1 text-xl font-black">Registrar pago</h2>
            <p className="mt-1 text-sm text-muted-foreground">Registra un pago de la deuda actual.</p>

            {paymentError ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" role="alert">{paymentError}</p> : null}
            {paymentSuccess ? <div className="mt-5"><PaymentSuccessMessage success={paymentSuccess} /></div> : null}

            {noDebt ? <p className="mt-5 rounded-xl bg-muted px-4 py-4 text-sm font-bold text-muted-foreground">No hay deuda pendiente para registrar un pago.</p> : null}
            {!noDebt && !inactive && cashSessionOpen === null ? <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-muted-foreground">Verificando caja…</p> : null}
            {!noDebt && !inactive && cashSessionOpen === false ? <div className="mt-5"><CashSessionNotice /></div> : null}
            {!noDebt && !inactive && cashSessionOpen === true ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl bg-muted p-4">
                  <SummaryLine label="Deuda actual" value={selectedCustomer.current_debt} strong />
                </div>
                <div>
                  <label htmlFor="collection-amount" className="block text-sm font-bold text-foreground">Monto del pago</label>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-bold text-muted-foreground">S/.</span>
                    <input
                      id="collection-amount"
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(sanitizeDecimalInput(event.target.value, 2))}
                      disabled={isPending}
                      autoComplete="off"
                      placeholder="0.00"
                      aria-describedby="collection-amount-help"
                      className="h-16 w-full rounded-xl border-2 border-input bg-background pl-14 pr-4 text-2xl font-black tabular-nums outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-muted"
                    />
                  </div>
                  <p id="collection-amount-help" className="mt-2 text-sm text-muted-foreground">Máximo: {formatCustomerMoney(debtCents ?? BigInt(0))}. Puedes usar punto o coma decimal.</p>
                  {amountTooHigh ? <p className="mt-2 text-sm font-bold text-destructive">El pago no puede superar la deuda actual.</p> : null}
                  {amountInvalid ? <p className="mt-2 text-sm font-bold text-destructive">El monto debe ser mayor que cero y tener máximo 2 decimales.</p> : null}
                </div>

                <fieldset>
                  <legend className="text-sm font-bold text-foreground">Método de pago</legend>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {(["CASH", "YAPE"] as const).map((method) => (
                      <label key={method} className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-base font-black transition ${paymentMethod === method ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted"}`}>
                        <input type="radio" name="collection-payment-method" value={method} checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} disabled={isPending} className="sr-only" />
                        {methodLabel(method).toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{paymentMethod === "CASH" ? "Se registra como ingreso de efectivo en la caja." : "Se registra como pago por Yape y no aumenta el efectivo físico."}</p>
                </fieldset>

                <button type="button" onClick={submitPayment} disabled={!canSubmit} className="min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                  {isPending ? "Registrando pago…" : "Registrar pago"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
