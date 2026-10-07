import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatQuantityInput,
  lineTotalCents,
  parseCents,
  parseThousandths,
} from "@/features/pos/money";

describe("POS money and quantity helpers", () => {
  it("parses and formats integer cents", () => {
    expect(parseCents("12")).toBe(BigInt(1200));
    expect(parseCents("12.3")).toBe(BigInt(1230));
    expect(parseCents("12.34")).toBe(BigInt(1234));
    expect(formatCents(BigInt(1234))).toBe("12.34");
    expect(formatCents(BigInt(-5))).toBe("-0.05");
  });

  it("rejects invalid or over-precise monetary input", () => {
    expect(parseCents("12.345")).toBeNull();
    expect(parseCents("-1.00")).toBeNull();
    expect(parseCents("12,34")).toBeNull();
    expect(parseCents("  ")).toBeNull();
  });

  it("parses quantities to thousandths", () => {
    expect(parseThousandths("2")).toBe(BigInt(2000));
    expect(parseThousandths("1.2")).toBe(BigInt(1200));
    expect(parseThousandths("1.234")).toBe(BigInt(1234));
    expect(parseThousandths("1.2345")).toBeNull();
  });

  it("removes fractional input for UNIT products while preserving WEIGHT input", () => {
    expect(formatQuantityInput("2.50", "UNIT")).toBe("2");
    expect(formatQuantityInput("2.50", "WEIGHT")).toBe("2.50");
  });

  it("calculates UNIT totals using cents", () => {
    expect(lineTotalCents("12.34", "2", "UNIT")).toBe(BigInt(2468));
    expect(lineTotalCents("12.34", "0.5", "UNIT")).toBe(BigInt(617));
  });

  it("rounds WEIGHT totals to the nearest ten cents", () => {
    expect(lineTotalCents("10.00", "1.234", "WEIGHT")).toBe(BigInt(1230));
    expect(lineTotalCents("1.00", "0.04", "WEIGHT")).toBe(BigInt(0));
    expect(lineTotalCents("1.00", "0.05", "WEIGHT")).toBe(BigInt(10));
  });

  it("returns null for invalid line inputs", () => {
    expect(lineTotalCents("invalid", "1", "UNIT")).toBeNull();
    expect(lineTotalCents("1.00", "invalid", "WEIGHT")).toBeNull();
  });
});
