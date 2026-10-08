import { describe, expect, it } from "vitest";
import { normalizeReportPeriod } from "../periods";

describe("sales report periods", () => {
  const now = new Date("2026-10-07T15:30:00.000Z");

  it("uses the Lima calendar date for today", () => {
    const result = normalizeReportPeriod("today", undefined, undefined, now);
    expect("error" in result ? result.error : result.from).toBe("2026-10-07");
  });

  it("starts the week on Monday", () => {
    const result = normalizeReportPeriod("week", undefined, undefined, now);
    expect("error" in result ? result.error : result.from).toBe("2026-10-05");
  });

  it("rejects custom ranges in reverse order", () => {
    expect(normalizeReportPeriod("custom", "2026-10-08", "2026-10-07", now)).toEqual({ error: "La fecha Hasta no puede ser anterior a Desde." });
  });

  it("uses an exclusive day after the inclusive custom end", () => {
    const result = normalizeReportPeriod("custom", "2026-10-07", "2026-10-07", now);
    expect("error" in result ? result.error : result.end.toISOString()).toBe("2026-10-08T05:00:00.000Z");
  });
});
