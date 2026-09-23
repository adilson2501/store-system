"use client";

import { applyKeypadKey } from "@/features/pos/money";

type Props = {
  value: string;
  onChange: (value: string) => void;
  maxDecimals: number;
  label: string;
  displaySuffix?: string;
  onDone: () => void;
};

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["back", "0", "."],
] as const;

export function NumericKeypad({
  value,
  onChange,
  maxDecimals,
  label,
  displaySuffix,
  onDone,
}: Props) {
  function press(key: string) {
    onChange(applyKeypadKey(value, key, maxDecimals));
  }

  return (
    <div className="rounded-xl border-2 border-blue-400 bg-blue-50/60 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            {label}
          </p>
          <p className="truncate text-3xl font-black tabular-nums text-slate-950">
            {value || "0"}
            {displaySuffix ? (
              <span className="ml-1 text-lg font-bold text-slate-600">{displaySuffix}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDone}
          className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-5 text-base font-bold text-white hover:bg-blue-700"
        >
          Listo
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => press(key)}
            className={`min-h-14 rounded-xl text-2xl font-bold ${
              key === "back"
                ? "bg-slate-200 text-slate-800 hover:bg-slate-300"
                : key === "."
                  ? "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                  : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
            aria-label={key === "back" ? "Retroceso" : key === "." ? "Punto decimal" : key}
          >
            {key === "back" ? "←" : key}
          </button>
        ))}
      </div>
    </div>
  );
}
