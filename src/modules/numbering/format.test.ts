import { describe, expect, it } from "vitest";
import { financialYear, financialYearCompact, fyStartYear } from "@/lib/fy";
import { DEFAULT_FORMATS, checkFormat, formatDocNumber } from "./format";

describe("financial year (IST)", () => {
  it("runs April to March", () => {
    expect(financialYear(new Date("2026-11-17T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-02-10T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-04-01T10:00:00Z"))).toBe("27-28");
    expect(financialYearCompact(new Date("2026-11-17T10:00:00Z"))).toBe("2627");
  });

  it("uses Indian time at the 31 March / 1 April boundary", () => {
    // 31 Mar 2027 19:00 UTC = 1 Apr 2027 00:30 IST -> new FY
    expect(fyStartYear(new Date("2027-03-31T19:00:00Z"))).toBe(2027);
    // 31 Mar 2027 18:00 UTC = 31 Mar 23:30 IST -> old FY
    expect(fyStartYear(new Date("2027-03-31T18:00:00Z"))).toBe(2026);
  });

  it("handles the century wrap", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00Z"))).toBe("99-00");
  });
});

describe("formatDocNumber", () => {
  const date = new Date("2026-11-17T10:00:00Z");
  it("replaces tokens and pads the sequence", () => {
    expect(formatDocNumber({ format: "{BRANCH}/JC/{FY}/{SEQ}", branchCode: "KOC", date, seq: 42, padding: 5 })).toBe(
      "KOC/JC/26-27/00042",
    );
    expect(formatDocNumber({ format: "{BRANCH}/{FYS}/{SEQ}", branchCode: "KOC", date, seq: 7, padding: 5 })).toBe(
      "KOC/2627/00007",
    );
  });
  it("does not truncate when the number outgrows the padding", () => {
    expect(formatDocNumber({ format: "{SEQ}", branchCode: "X", date, seq: 123456, padding: 3 })).toBe("123456");
  });
});

describe("checkFormat", () => {
  it("requires {SEQ} and known tokens", () => {
    expect(checkFormat({ format: "{BRANCH}/X", docType: "JOB_CARD", branchCode: "KOC", padding: 5 }).ok).toBe(false);
    expect(
      checkFormat({ format: "{BRANCH}/{YEAR}/{SEQ}", docType: "JOB_CARD", branchCode: "KOC", padding: 5 }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("{YEAR}"),
    });
  });

  it("enforces the 16-character GST limit on invoices and credit notes only", () => {
    const long = "{BRANCH}/INV/{FY}/{SEQ}"; // KOC/INV/26-27/99999 = 19 chars
    expect(checkFormat({ format: long, docType: "TAX_INVOICE", branchCode: "KOC", padding: 5 }).ok).toBe(false);
    expect(checkFormat({ format: long, docType: "JOB_CARD", branchCode: "KOC", padding: 5 }).ok).toBe(true);
  });

  it("every default format is valid for the longest allowed branch code", () => {
    for (const [docType, def] of Object.entries(DEFAULT_FORMATS)) {
      const res = checkFormat({
        format: def.format,
        docType: docType as keyof typeof DEFAULT_FORMATS,
        branchCode: "ABCD",
        padding: def.padding,
      });
      expect(res, `${docType}: ${JSON.stringify(res)}`).toMatchObject({ ok: true });
    }
  });
});
