"use client";

import { useState, useTransition } from "react";
import { closeCashSession, getCurrentCashSessionState, openCashSession } from "@/features/cash/actions";
import { formatCents, parseCents } from "@/features/pos/money";
import type { CashSessionState, CashSessionSummary, ClosedCashSession } from "@/features/cash/types";

function newClientKey() {
  return crypto.randomUUID();
}

function normalizeMoneyInput(value: string): string {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dotIndex = normalized.indexOf(".");
  if (dotIndex === -1) return normalized;
  const whole = normalized.slice(0, dotIndex) || "0";
  const fraction = normalized.slice(dotIndex + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

function formatMoney(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "S/. 0.00" : `S/. ${formatCents(cents)}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE");
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function differenceState(value: bigint | null): { label: string; detail: string; className: string } {
  if (value === null || value === BigInt(0)) {
    return { label: "Caja cuadrada", detail: "S/. 0.00", className: "border-success/30 bg-success/10 text-success" };
  }
  if (value < BigInt(0)) {
    return { label: "Faltante", detail: `S/. ${formatCents(-value)}`, className: "border-destructive/30 bg-destructive/10 text-destructive" };
  }
  return { label: "Sobrante", detail: `S/. ${formatCents(value)}`, className: "border-info/30 bg-info/10 text-info" };
}

function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  label,
  help,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  help: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-foreground">{label}</label>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-bold text-muted-foreground">S/.</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          minLength={1}
          value={value}
          onChange={(event) => onChange(normalizeMoneyInput(event.target.value))}
          disabled={disabled}
          autoComplete="off"
          placeholder="0.00"
          aria-describedby={`${id}-help`}
          className="h-16 w-full rounded-xl border-2 border-input bg-card pl-14 pr-4 text-2xl font-black tabular-nums outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-muted"
        />
      </div>
      <p id={`${id}-help`} className="mt-2 text-sm text-muted-foreground">{help}</p>
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-bold text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-black tabular-nums" : "font-semibold tabular-nums"}>{formatMoney(value)}</dd>
    </div>
  );
}

function PhysicalCash({ summary }: { summary: CashSessionSummary }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="physical-cash-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Efectivo físico</p>
          <h2 id="physical-cash-title" className="mt-1 text-lg font-black">Lo que debería haber en caja</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">3 fuentes</span>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <SummaryLine label="Monto inicial" value={summary.opening_cash} />
        <SummaryLine label="Ventas en efectivo" value={summary.cash_sales} />
        <SummaryLine label="Cobros de fiado" value={summary.cash_debt_payments} />
        <div className="border-t border-border pt-3">
          <SummaryLine label="Efectivo esperado" value={summary.expected_cash} strong />
        </div>
      </dl>
    </section>
  );
}

function OtherActivity({ summary }: { summary: CashSessionSummary }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="other-activity-title">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Otros movimientos</p>
      <h2 id="other-activity-title" className="mt-1 text-lg font-black">Actividad que no está en el cajón</h2>
      <dl className="mt-5 space-y-3 text-sm">
        <SummaryLine label="Ventas Yape" value={summary.yape_sales} />
        <SummaryLine label="Ventas fiadas" value={summary.credit_sales} />
        <SummaryLine label="Cobros de deuda por Yape" value={summary.yape_debt_payments} />
        <div className="border-t border-border pt-3">
          <SummaryLine label="Total vendido" value={summary.total_sales} strong />
        </div>
      </dl>
    </section>
  );
}

function CloseDifference({ difference }: { difference: bigint | null }) {
  const state = differenceState(difference);
  return (
    <div className={`rounded-xl border px-4 py-3 ${state.className}`}>
      <p className="text-sm font-bold">Diferencia</p>
      <p className="mt-1 text-xl font-black tabular-nums">{state.label}: {state.detail}</p>
      <p className="mt-1 text-xs opacity-80">Efectivo contado menos efectivo esperado</p>
    </div>
  );
}

function ClosedSummary({ snapshot, onNewSession }: { snapshot: ClosedCashSession; onNewSession: () => void }) {
  const difference = parseCents(snapshot.difference);
  const state = differenceState(difference);
  return (
    <section className="space-y-5" aria-labelledby="closed-title">
      <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-success sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em]">Resultado del turno</p>
        <h2 id="closed-title" className="mt-2 text-2xl font-black">Caja cerrada</h2>
        <p className="mt-1 font-bold">{state.label}: {state.detail}</p>
        <p className="mt-2 text-sm opacity-80">Cerrada: {dateTime(snapshot.closed_at)}</p>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-label="Resumen del cierre">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <SummaryLine label="Efectivo esperado" value={snapshot.expected_cash} strong />
          <SummaryLine label="Efectivo contado" value={snapshot.counted_cash} strong />
          <div className="sm:col-span-2"><CloseDifference difference={difference} /></div>
        </dl>
      </section>
      <button type="button" onClick={onNewSession} className="min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-black text-primary-foreground hover:bg-primary/90">
        Abrir nueva caja
      </button>
    </section>
  );
}

export function CashScreen({ initialState, initialError = "" }: { initialState: CashSessionState; initialError?: string }) {
  const [state, setState] = useState(initialState);
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [openingClientKey, setOpeningClientKey] = useState(newClientKey);
  const [closeClientKey, setCloseClientKey] = useState(newClientKey);
  const [closeRequested, setCloseRequested] = useState(false);
  const [error, setError] = useState(initialError);
  const [isPending, startTransition] = useTransition();

  const openAmountCents = parseCents(openingCash);
  const countedCents = parseCents(countedCash);
  const summary = state.kind === "OPEN" ? state.summary : null;
  const expectedCents = summary === null ? null : parseCents(summary.expected_cash);
  const differenceCents = countedCents !== null && expectedCents !== null ? countedCents - expectedCents : null;
  const canOpen = openAmountCents !== null && openAmountCents >= BigInt(0) && !isPending;
  const canClose = state.kind === "OPEN" && countedCents !== null && countedCents >= BigInt(0) && !isPending;

  function showError(message: string) {
    setError(message);
  }

  function refresh() {
    setError("");
    startTransition(async () => {
      try {
        setState(await getCurrentCashSessionState());
      } catch (refreshError) {
        console.error(refreshError);
        showError("No se pudo actualizar la caja.");
      }
    });
  }

  function submitOpening() {
    if (!canOpen) return;
    setError("");
    startTransition(async () => {
      const result = await openCashSession({ clientKey: openingClientKey, openingCash });
      if (!result.ok) {
        showError(result.error || "No se pudo abrir la caja.");
        return;
      }
      setState(result.state);
      setOpeningCash("");
      setOpeningClientKey(newClientKey());
      setCloseClientKey(newClientKey());
    });
  }

  function submitClosing() {
    if (!canClose || state.kind !== "OPEN") return;
    setError("");
    startTransition(async () => {
      const result = await closeCashSession({
        sessionId: state.session.session_id,
        clientKey: closeClientKey,
        countedCash,
      });
      if (!result.ok) {
        showError(result.error || "No se pudo cerrar la caja.");
        return;
      }
      setState({ kind: "CLOSED", snapshot: result.snapshot });
      setCountedCash("");
      setCloseRequested(false);
      setCloseClientKey(newClientKey());
    });
  }

  function startNewSession() {
    setState({ kind: "NONE" });
    setOpeningCash("");
    setCountedCash("");
    setOpeningClientKey(newClientKey());
    setCloseClientKey(newClientKey());
    setCloseRequested(false);
    setError("");
  }

  if (state.kind === "CLOSED") {
    return <ClosedSummary snapshot={state.snapshot} onNewSession={startNewSession} />;
  }

  if (state.kind === "NONE") {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8" aria-labelledby="open-cash-title">
        <div className="rounded-2xl bg-muted p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Estado de caja</p>
          <h2 id="open-cash-title" className="mt-2 text-2xl font-black">Caja cerrada</h2>
          <p className="mt-2 text-muted-foreground">Abre una caja antes de comenzar a vender.</p>
        </div>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" role="alert">{error}</p> : null}
        <div className="mt-6">
          <MoneyInput id="opening-cash" label="Monto inicial" help="Efectivo con el que empiezas el turno." value={openingCash} onChange={setOpeningCash} disabled={isPending} />
        </div>
        <button type="button" onClick={submitOpening} disabled={!canOpen} className="mt-6 min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
          {isPending ? "Abriendo caja…" : "Abrir caja"}
        </button>
        <button type="button" onClick={refresh} disabled={isPending} className="mt-3 min-h-12 w-full rounded-xl px-4 py-3 text-sm font-bold text-muted-foreground hover:bg-muted disabled:opacity-60">
          {isPending ? "Actualizando…" : "Actualizar estado"}
        </button>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-success sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]">Estado de caja</p>
            <h2 className="mt-2 text-2xl font-black">Caja abierta</h2>
            <p className="mt-2 text-sm opacity-80">Abierta desde {time(state.session.opened_at)}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-bold opacity-80">Efectivo esperado</p>
            <p className="mt-1 text-4xl font-black tracking-tight tabular-nums">{formatMoney(summary.expected_cash)}</p>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive" role="alert">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <PhysicalCash summary={summary} />
        <OtherActivity summary={summary} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="close-cash-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Siguiente tarea</p>
            <h2 id="close-cash-title" className="mt-1 text-xl font-black">Cerrar caja</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cuenta el dinero físico que realmente tienes en caja.</p>
          </div>
          <button type="button" onClick={refresh} disabled={isPending} className="min-h-12 rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60">
            {isPending ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {!closeRequested ? (
          <div className="mt-5 grid gap-4 rounded-xl bg-muted p-4 sm:grid-cols-2">
            <SummaryLine label="Efectivo esperado" value={summary.expected_cash} strong />
            <div className="sm:col-span-2">
              <MoneyInput id="counted-cash" label="Efectivo contado" help="Cuenta y registra todo el dinero físico que tienes." value={countedCash} onChange={setCountedCash} disabled={isPending} />
            </div>
            {differenceCents !== null ? <div className="sm:col-span-2"><CloseDifference difference={differenceCents} /></div> : null}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-close-title">
            <h3 id="confirm-close-title" className="text-lg font-black">¿Cerrar la caja?</h3>
            <p className="mt-1 text-sm text-muted-foreground">Revisa estos valores antes de confirmar el cierre.</p>
            <dl className="mt-5 space-y-3 rounded-xl bg-card p-4 text-sm">
              <SummaryLine label="Esperado" value={summary.expected_cash} strong />
              <SummaryLine label="Contado" value={countedCash} strong />
            </dl>
            <div className="mt-4"><CloseDifference difference={differenceCents} /></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setCloseRequested(false)} disabled={isPending} className="min-h-14 rounded-xl border border-border px-4 text-base font-bold text-foreground hover:bg-muted disabled:opacity-60">Volver</button>
              <button type="button" onClick={submitClosing} disabled={!canClose} className="min-h-14 rounded-xl bg-primary px-4 text-base font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                {isPending ? "Cerrando caja…" : "Confirmar cierre"}
              </button>
            </div>
          </div>
        )}

        {!closeRequested ? (
          <button type="button" onClick={() => setCloseRequested(true)} disabled={!canClose} className="mt-5 min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
            Cerrar caja
          </button>
        ) : null}
        {closeRequested && differenceCents === null ? <p className="mt-4 text-sm font-semibold text-destructive" role="alert">Ingresa el efectivo contado para continuar.</p> : null}
      </section>
    </section>
  );
}
