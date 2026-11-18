import { describe, expect, it } from "vitest";
import { CONTENT, CONTENT_KINDS } from "./content-registry";
import { emptyFor, fieldsSchema, imageIdsIn, SAFE_HREF } from "./fields";
import { readSection, RESERVED_SLUGS, SECTION_TYPES, SECTIONS, sectionSchema } from "./sections";
import { readSiteSettings } from "./site-settings";

describe("section definitions", () => {
  it.each(SECTION_TYPES)("%s defaults are valid content", (type) => {
    const r = sectionSchema(type).safeParse({ ...emptyFor(SECTIONS[type].fields), ...SECTIONS[type].defaults });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("readSection fills missing fields and ignores unknown types", () => {
    expect(readSection("nope", {})).toBeNull();
    const hero = readSection("hero", { headline: "Hello" })!;
    expect(hero.headline).toBe("Hello");
    expect(hero.primary).toEqual({ label: "Enquire about a course", href: "/enquire" });
  });

  it("readSection falls back to defaults on invalid stored content", () => {
    const stats = readSection("stats", { items: [{ value: "lots", label: "" }] })!;
    expect((stats.items as unknown[]).length).toBe(4);
  });
});

describe("links", () => {
  it("allows paths, anchors, https, tel and mailto", () => {
    for (const ok of ["/courses", "#contact", "https://wa.me/91984", "tel:+91 98470 12345", "mailto:a@b.in"])
      expect(SAFE_HREF.test(ok), ok).toBe(true);
  });
  it("rejects scripts and protocol-relative links", () => {
    for (const bad of ["javascript:alert(1)", "//evil.com", "data:text/html,x", "vbscript:x"])
      expect(SAFE_HREF.test(bad), bad).toBe(false);
  });
  it("needs both label and link, or neither", () => {
    const schema = fieldsSchema([{ name: "cta", label: "Button", type: "link" }]);
    expect(schema.safeParse({ cta: { label: "Go", href: "" } }).success).toBe(false);
    expect(schema.safeParse({ cta: { label: "", href: "" } }).success).toBe(true);
    expect(schema.safeParse({ cta: { label: "Go", href: "/x" } }).success).toBe(true);
  });
});

describe("content lists", () => {
  it.each(CONTENT_KINDS)("%s has a valid empty form apart from required fields", (kind) => {
    const def = CONTENT[kind];
    const r = fieldsSchema(def.fields).safeParse(emptyFor(def.fields));
    const required = def.fields.filter((f) => f.required && !(f.type === "select" && f.default)).map((f) => f.name);
    const failing = r.success ? [] : [...new Set(r.error.issues.map((i) => String(i.path[0])))];
    expect(failing.sort()).toEqual(required.sort());
  });

  it("collects image ids, including inside lists", () => {
    const fields = SECTIONS.hero.fields;
    expect(imageIdsIn(fields, { image: "img1" })).toEqual(["img1"]);
  });
});

it("reserves app routes for custom page slugs", () => {
  for (const s of ["admin", "api", "track", "courses", "enquire"]) expect(RESERVED_SLUGS.has(s)).toBe(true);
});

it("site settings fill in defaults", () => {
  const s = readSiteSettings({ contact: { phone: "9847012345" } });
  expect(s.contact.phone).toBe("9847012345");
  expect(s.header.ctaHref).toBe("/enquire");
  expect(readSiteSettings(null).whatsapp.enabled).toBe(true);
});
