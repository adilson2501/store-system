"use client";

import { useState, useTransition } from "react";
import { closeCashSession, getCurrentCashSessionState, openCashSession } from "@/features/cash/actions";
import { formatCents, parseCents } from "@/features/pos/money";
import type { CashSessionState, CashSessionSummary, ClosedCashSession } from "@/features/cash/types";

function newClientKey() {
  return crypto.randomUUID();
}

function formatMoney(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "S/. 0.00" : `S/. ${formatCents(cents)}`;
}

function formatSignedMoney(value: string): string {
  const cents = parseCents(value.replace(/^-/, ""));
  if (cents === null) return "S/. 0.00";
  if (cents === BigInt(0)) return "S/. 0.00";
  return value.startsWith("-") ? `-S/. ${formatCents(cents)}` : `+S/. ${formatCents(cents)}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE");
}

function Summary({ summary }: { summary: CashSessionSummary }) {
  return (
    <dl className="mt-5 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
      <div className="px-4 py-3 text-sm font-semibold text-zinc-500">Resumen actual</div>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <SummaryRow label="Ventas en efectivo" value={summary.cash_sales} />
        <SummaryRow label="Ventas Yape" value={summary.yape_sales} />
        <SummaryRow label="Ventas fiadas" value={summary.credit_sales} />
        <SummaryRow label="Cobros de deuda en efectivo" value={summary.cash_debt_payments} />
        <SummaryRow label="Cobros de deuda por Yape" value={summary.yape_debt_payments} />
        <SummaryRow label="Total vendido" value={summary.total_sales} strong />
        <SummaryRow label="Efectivo esperado" value={summary.expected_cash} strong />
      </div>
    </dl>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-600">{label}</dt>
      <dd className={strong ? "font-black tabular-nums" : "font-semibold tabular-nums"}>{formatMoney(value)}</dd>
    </div>
  );
}

function ClosedSummary({ snapshot }: { snapshot: ClosedCashSession }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <p className="text-lg font-bold">Caja cerrada</p>
        <p className="mt-1 text-sm">El cierre quedó registrado correctamente.</p>
      </div>
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div><p className="text-zinc-500">Hora de apertura</p><p className="font-semibold">{dateTime(snapshot.opened_at)}</p></div>
        <div><p className="text-zinc-500">Hora de cierre</p><p className="font-semibold">{dateTime(snapshot.closed_at)}</p></div>
      </div>
      <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <SummaryRow label="Fondo inicial" value={snapshot.opening_cash} />
          <SummaryRow label="Ventas en efectivo" value={snapshot.cash_sales} />
          <SummaryRow label="Ventas Yape" value={snapshot.yape_sales} />
          <SummaryRow label="Ventas fiadas" value={snapshot.credit_sales} />
          <SummaryRow label="Cobros de deuda en efectivo" value={snapshot.cash_debt_payments} />
          <SummaryRow label="Cobros de deuda por Yape" value={snapshot.yape_debt_payments} />
          <SummaryRow label="Total vendido" value={snapshot.total_sales} strong />
          <SummaryRow label="Efectivo esperado" value={snapshot.expected_cash} strong />
          <SummaryRow label="Efectivo contado" value={snapshot.counted_cash} strong />
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <dt className="font-semibold text-zinc-700">Diferencia</dt>
            <dd className="text-lg font-black tabular-nums">{formatSignedMoney(snapshot.difference)}</dd>
          </div>
        </div>
      </dl>
    </div>
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

  function refresh() {
    setError("");
    startTransition(async () => {
      try {
        setState(await getCurrentCashSessionState());
      } catch (refreshError) {
        console.error(refreshError);
        setError("No se pudo cargar la caja. Intenta actualizar nuevamente.");
      }
    });
  }

  function submitOpening() {
    if (!canOpen) return;
    setError("");
    startTransition(async () => {
      const result = await openCashSession({ clientKey: openingClientKey, openingCash });
      if (!result.ok) {
        setError(result.error);
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
        setError(result.error);
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
    return (
      <section className="space-y-5">
        <ClosedSummary snapshot={state.snapshot} />
        <button type="button" onClick={startNewSession} className="min-h-14 w-full rounded-xl bg-blue-600 px-4 text-lg font-bold text-white hover:bg-blue-700">
          Abrir nueva caja
        </button>
      </section>
    );
  }

  if (state.kind === "NONE") {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="rounded-xl bg-zinc-100 p-4">
          <p className="text-lg font-bold">Caja cerrada</p>
          <p className="mt-1 text-sm text-zinc-600">Abre la caja para comenzar la jornada.</p>
        </div>
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
        <div className="mt-5">
          <label htmlFor="opening-cash" className="block text-sm font-semibold text-zinc-700">Monto inicial en efectivo</label>
          <input
            id="opening-cash"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={openingCash}
            onChange={(event) => setOpeningCash(event.target.value)}
            disabled={isPending}
            autoComplete="off"
            placeholder="0.00"
            className="mt-2 h-14 w-full rounded-xl border-2 border-zinc-300 px-4 text-2xl font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-zinc-100"
          />
        </div>
        <button type="button" onClick={submitOpening} disabled={!canOpen} className="mt-5 min-h-14 w-full rounded-xl bg-blue-600 px-4 text-lg font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
          {isPending ? "Abriendo…" : "Abrir caja"}
        </button>
        <button type="button" onClick={refresh} disabled={isPending} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
          Actualizar estado
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <p className="text-lg font-bold">Caja abierta</p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-emerald-700">Hora de apertura</dt><dd className="font-semibold">{dateTime(state.session.opened_at)}</dd></div>
          <div><dt className="text-emerald-700">Fondo inicial</dt><dd className="font-semibold">{formatMoney(state.session.opening_cash)}</dd></div>
        </dl>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
      <Summary summary={state.summary} />

      {!closeRequested ? (
        <button type="button" onClick={() => setCloseRequested(true)} disabled={isPending} className="min-h-14 w-full rounded-xl bg-zinc-900 px-4 text-lg font-black text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
          Cerrar caja
        </button>
      ) : (
        <div className="rounded-xl border border-zinc-300 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold">Cerrar caja</h2>
          <dl className="mt-4 grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-2">
            <SummaryRow label="Fondo inicial" value={state.summary.opening_cash} />
            <SummaryRow label="Efectivo esperado" value={state.summary.expected_cash} strong />
          </dl>
          <label htmlFor="counted-cash" className="mt-5 block text-sm font-semibold text-zinc-700">Efectivo contado</label>
          <input
            id="counted-cash"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={countedCash}
            onChange={(event) => setCountedCash(event.target.value)}
            disabled={isPending}
            autoComplete="off"
            placeholder="0.00"
            className="mt-2 h-14 w-full rounded-xl border-2 border-zinc-300 px-4 text-2xl font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-zinc-100"
          />
          {differenceCents !== null ? (
            <div className="mt-4 rounded-xl bg-zinc-100 px-4 py-3">
              <p className="text-sm text-zinc-600">Diferencia</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{differenceCents < BigInt(0) ? `-S/. ${formatCents(-differenceCents)}` : `+S/. ${formatCents(differenceCents)}`}</p>
              <p className="mt-1 text-xs text-zinc-500">Efectivo contado - Efectivo esperado</p>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setCloseRequested(false)} disabled={isPending} className="min-h-14 rounded-xl border border-zinc-300 px-4 text-base font-bold text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100">
              Cancelar
            </button>
            <button type="button" onClick={submitClosing} disabled={!canClose} className="min-h-14 rounded-xl bg-emerald-600 px-4 text-base font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
              {isPending ? "Cerrando…" : "Confirmar cierre"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
