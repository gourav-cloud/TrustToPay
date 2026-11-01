import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  formatDate,
  formatDateShort,
  formatMoney,
  humanize,
  initials,
  parseMoneyToMinor,
  paymentTone,
  taskStatusTone,
  timeAgo,
  truncate,
  verificationTone,
} from "./format";

describe("formatMoney", () => {
  it("renders integer minor units as USD without floating point drift", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(1500)).toBe("$15.00");
    expect(formatMoney(123_456_789)).toBe("$1,234,567.89");
  });

  it("keeps the sign for negative amounts", () => {
    expect(formatMoney(-1234)).toBe("-$12.34");
    expect(formatMoney(-5)).toBe("-$0.05");
  });

  it("falls back to zero for non-finite input", () => {
    expect(formatMoney(Number.NaN)).toBe("$0.00");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });
});

describe("parseMoneyToMinor", () => {
  it("parses decimal strings from forms", () => {
    expect(parseMoneyToMinor("15.50")).toBe(1550);
    expect(parseMoneyToMinor("15.5")).toBe(1550);
    expect(parseMoneyToMinor("15")).toBe(1500);
    expect(parseMoneyToMinor("$1,234.56")).toBe(123_456);
    expect(parseMoneyToMinor(" 0.99 ")).toBe(99);
  });

  it("rejects malformed or over-precise amounts", () => {
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("15.")).toBeNull();
    expect(parseMoneyToMinor("15.555")).toBeNull();
    expect(parseMoneyToMinor("-5")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
  });
});

describe("display helpers", () => {
  it("humanizes enum-style statuses", () => {
    expect(humanize("PAYMENT_READY")).toBe("Payment Ready");
    expect(humanize("VERIFICATION_PENDING")).toBe("Verification Pending");
    expect(humanize(null)).toBe("—");
  });

  it("builds initials from the first two name parts", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada Byron Lovelace")).toBe("AB");
    expect(initials("Ada")).toBe("A");
    expect(initials("   ")).toBe("");
  });

  it("truncates long text and leaves short text alone", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
    expect(truncate("abcdef", 6)).toBe("abcdef");
  });

  it("returns a dash for missing or invalid dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateShort(undefined)).toBe("—");
    expect(formatDateShort("not-a-date")).toBe("—");
  });

  it("formats recent timestamps as relative time", () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo(new Date(Date.now() - 5_000).toISOString())).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toMatch(/^\d+m ago$/);
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toMatch(/^\d+h ago$/);
  });
});

describe("status tones", () => {
  it("maps task statuses to semantic tones", () => {
    expect(taskStatusTone("PAYMENT_PAID")).toBe("success");
    expect(taskStatusTone("HANDED_OFF")).toBe("success");
    expect(taskStatusTone("PAYMENT_READY")).toBe("info");
    expect(taskStatusTone("UNDER_VERIFICATION")).toBe("info");
    expect(taskStatusTone("OFFERED")).toBe("info");
    expect(taskStatusTone("NEEDS_MANUAL_REVIEW")).toBe("warning");
    expect(taskStatusTone("NEEDS_REVISION")).toBe("danger");
    expect(taskStatusTone("VERIFICATION_REJECTED")).toBe("danger");
    expect(taskStatusTone("PAYMENT_PROCESSING")).toBe("accent");
    expect(taskStatusTone("SOMETHING_NEW")).toBe("neutral");
  });

  it("maps verification and payment statuses", () => {
    expect(verificationTone("PASSED")).toBe("success");
    expect(verificationTone("REJECTED")).toBe("danger");
    expect(verificationTone("NEEDS_MANUAL_REVIEW")).toBe("warning");
    expect(verificationTone("PENDING")).toBe("info");

    expect(paymentTone("COMPLETED")).toBe("success");
    expect(paymentTone("PROCESSING")).toBe("info");
    expect(paymentTone("FAILED")).toBe("danger");
    expect(paymentTone("UNKNOWN")).toBe("neutral");
  });

  it("labels confidence against the escalation threshold", () => {
    expect(confidenceLabel(0.9)).toEqual({ label: "Above threshold", tone: "success" });
    expect(confidenceLabel(0.6)).toEqual({ label: "Low confidence", tone: "warning" });
    expect(confidenceLabel(0.1)).toEqual({ label: "Very low confidence", tone: "danger" });
  });
});
