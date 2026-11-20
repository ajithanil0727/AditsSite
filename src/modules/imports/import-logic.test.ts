import { describe, expect, it } from "vitest";
import { duplicatesInFile, mapHeaders, parseDate, parseRow } from "./import-logic";

describe("parseDate", () => {
  it("reads DD/MM/YYYY, ISO and Excel dates; rejects impossible dates", () => {
    expect(parseDate("15/08/2004")).toBe("2004-08-15");
    expect(parseDate("1-6-2025")).toBe("2025-06-01");
    expect(parseDate("2025-06-01")).toBe("2025-06-01");
    expect(parseDate(new Date("2025-06-01T00:00:00Z"))).toBe("2025-06-01");
    expect(parseDate("31/02/2025")).toBeNull();
    expect(parseDate("next week")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("mapHeaders", () => {
  it("matches headers ignoring case and spaces, and lists missing required ones", () => {
    const { index, missing } = mapHeaders("students", ["name", " PHONE ", "Branch Code", "Email"]);
    expect(index).toMatchObject({ name: 0, phone: 1, branchCode: 2, email: 3 });
    expect(missing).toEqual([]);
    expect(mapHeaders("students", ["Name"]).missing).toEqual(["Phone", "Branch code"]);
  });
});

describe("parseRow", () => {
  it("accepts a good student row and normalises the phone", () => {
    const r = parseRow("students", 2, {
      name: "Anjali",
      phone: "+91 98470 12345",
      branchCode: "PKD",
      dob: "15/08/2004",
      email: "A@X.COM",
    });
    expect(r.errors).toEqual([]);
    expect(r.row?.values).toMatchObject({ name: "Anjali", phone: "9847012345", dob: "2004-08-15", email: "a@x.com" });
  });
  it("lists every problem on the row", () => {
    const r = parseRow("students", 3, {
      name: "",
      phone: "12345",
      branchCode: "PKD",
      email: "nope",
      dob: "32/01/2000",
    });
    expect(r.errors.map((e) => e.message)).toEqual([
      "Name is required.",
      'Phone "12345" isn\'t a valid 10-digit mobile number.',
      'Email "nope" isn\'t a valid email.',
      'Date of birth "32/01/2000" isn\'t a date (use DD/MM/YYYY).',
    ]);
  });
  it("checks part kinds, GST rates and complete opening stock", () => {
    const r = parseRow("parts", 4, {
      sku: "X1",
      name: "Thing",
      unit: "Nos",
      kind: "gadget",
      gstRate: 15,
      openingBranch: "PKD",
      openingQty: 2,
    });
    expect(r.errors.map((e) => e.message)).toEqual([
      'Kind "gadget" isn\'t one of: Spare part, IC, Consumable, Tool, Equipment.',
      "GST % must be 0, 5, 12, 18 or 28.",
      "For opening stock, fill the branch, qty and unit cost.",
    ]);
    const ok = parseRow("parts", 5, {
      sku: "X2",
      name: "Thing",
      unit: "Nos",
      salePrice: "₹1,250.50",
      openingBranch: "PKD",
      openingQty: 2,
      openingCost: 800,
    });
    expect(ok.errors).toEqual([]);
    expect(ok.row?.values.salePrice).toBe(1250.5);
  });
});

describe("duplicatesInFile", () => {
  it("flags repeats after the first", () => {
    const rows = [
      { row: 2, values: { phone: "9847012345" } },
      { row: 3, values: { phone: "9847012346" } },
      { row: 4, values: { phone: "9847012345" } },
    ];
    expect(duplicatesInFile(rows, "phone", "Phone")).toEqual([
      { row: 4, message: "Phone 9847012345 is also on row 2." },
    ]);
  });
});
