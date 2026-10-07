import type { ReportPeriod, SalesReportPeriod } from "./types";

export const LIMA_TIME_ZONE = "America/Lima";

function dateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function formatDateParts(parts: { year: number; month: number; day: number }): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function limaDateStart(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 5));
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeReportPeriod(
  period: ReportPeriod | undefined,
  from: string | undefined,
  to: string | undefined,
  now = new Date(),
): SalesReportPeriod | { error: string } {
  const current = dateParts(now);
  const today = formatDateParts(current);
  let startDate = today;
  const end = now;

  if (period === "custom") {
    if (!from || !to || !isCalendarDate(from) || !isCalendarDate(to)) {
      return { error: "Selecciona fechas válidas para el periodo personalizado." };
    }
    if (to < from) return { error: "La fecha Hasta no puede ser anterior a Desde." };
    return {
      period: "custom",
      from,
      to,
      start: limaDateStart(from),
      end: new Date(limaDateStart(to).getTime() + 24 * 60 * 60 * 1000),
    };
  }

  if (period === "week") {
    const currentDate = new Date(Date.UTC(current.year, current.month - 1, current.day));
    const mondayOffset = (currentDate.getUTCDay() + 6) % 7;
    currentDate.setUTCDate(currentDate.getUTCDate() - mondayOffset);
    startDate = formatDateParts({ year: currentDate.getUTCFullYear(), month: currentDate.getUTCMonth() + 1, day: currentDate.getUTCDate() });
  } else if (period === "month") {
    startDate = formatDateParts({ year: current.year, month: current.month, day: 1 });
  }

  return { period: period === "week" || period === "month" ? period : "today", from: startDate, to: today, start: limaDateStart(startDate), end };
}
