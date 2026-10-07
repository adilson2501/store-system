import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  parseRole,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from "@/features/users/validation";

describe("user management validation", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  OWNER@Example.COM ")).toBe("owner@example.com");
  });

  it("validates email addresses", () => {
    expect(validateEmail("seller@example.com")).toBeNull();
    expect(validateEmail("invalid")).toBeTruthy();
  });

  it("validates display names", () => {
    expect(validateDisplayName(" Ana ")).toBeNull();
    expect(validateDisplayName(" ")).toBeTruthy();
  });

  it("accepts only application roles", () => {
    expect(parseRole("ADMIN")).toBe("ADMIN");
    expect(parseRole("OWNER")).toBeNull();
  });

  it("validates temporary passwords", () => {
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("long-enough-password")).toBeNull();
  });

  it("requires matching password confirmation", () => {
    expect(validatePasswordConfirmation("password", "password")).toBeNull();
    expect(validatePasswordConfirmation("password", "different")).toBeTruthy();
  });
});
