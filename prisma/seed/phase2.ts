/**
 * Phase 2 demo data: service + inventory masters, parts, opening stock, cash/bank accounts, a few job cards.
 * Idempotent: looks rows up by name/code before creating them; never overwrites edits.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { DocType, JobStatusKey, PartKind } from "../../src/generated/prisma/enums";
import { financialYear } from "../../src/lib/fy";
import { DEFAULT_FORMATS, formatDocNumber } from "../../src/modules/numbering/format";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };

async function ensure<T extends { id: string }>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

/** Reserve a document number the same way the app does (seed can't import server-only code). */
async function reserveNumber(db: PrismaClient, branchId: string, branchCode: string, docType: DocType, date: Date) {
  const fy = financialYear(date);
  const def = DEFAULT_FORMATS[docType];
  const row = await db.numberSeries.upsert({
    where: { branchId_docType_financialYear: { branchId, docType, financialYear: fy } },
    create: {
      organizationId: (await db.branch.findUniqueOrThrow({ where: { id: branchId } })).organizationId,
      branchId,
      docType,
      financialYear: fy,
      format: def.format,
      padding: def.padding,
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  return formatDocNumber({ format: row.format, branchCode, date, seq: row.nextNumber - 1, padding: row.padding });
}

export async function seedPhase2(db: PrismaClient, ctx: Ctx) {
  const { orgId } = ctx;

  // --- Tax rates & HSN/SAC ---
  const rates: Record<number, string> = {};
  for (const r of [0, 5, 12, 18, 28]) {
    const row = await ensure(
      () => db.taxRate.findFirst({ where: { organizationId: orgId, rate: r } }),
      () => db.taxRate.create({ data: { organizationId: orgId, name: `GST ${r}%`, rate: r } }),
    );
    rates[r] = row.id;
  }
  const hsnDefs = [
    { code: "998713", description: "Repair of computers and peripherals", isService: true },
    { code: "998717", description: "Repair of mobile phones and telecom equipment", isService: true },
    { code: "998719", description: "Repair of other electronic goods", isService: true },
    { code: "85177990", description: "Parts of mobile phones", isService: false },
    { code: "84733099", description: "Parts of computers / laptops", isService: false },
    { code: "85076000", description: "Lithium-ion batteries", isService: false },
    { code: "85423100", description: "Integrated circuits", isService: false },
    { code: "85444999", description: "Cables and wires", isService: false },
    { code: "82055190", description: "Hand tools", isService: false },
  ];
  const hsn: Record<string, string> = {};
  for (const h of hsnDefs) {
    const row = await db.hsnSac.upsert({
      where: { organizationId_code: { organizationId: orgId, code: h.code } },
      create: { organizationId: orgId, ...h, defaultTaxRateId: rates[18] },
      update: {},
    });
    hsn[h.code] = row.id;
  }

  // --- Payment modes ---
  const modes: Record<string, string> = {};
  for (const [i, m] of [
    { name: "Cash", requiresReference: false },
    { name: "UPI", requiresReference: true },
    { name: "Card", requiresReference: true },
    { name: "Bank transfer", requiresReference: true },
    { name: "Cheque", requiresReference: true },
  ].entries()) {
    const row = await ensure(
      () => db.paymentMode.findFirst({ where: { organizationId: orgId, name: m.name } }),
      () => db.paymentMode.create({ data: { organizationId: orgId, ...m, sortOrder: i } }),
    );
    modes[m.name] = row.id;
  }

  // --- Cash & bank accounts per branch ---
  for (const [code, branchId] of Object.entries(ctx.branchIds)) {
    for (const acc of [
      { name: `${code} Cash`, type: "CASH" as const },
      { name: `${code} HDFC Current`, type: "BANK" as const, bankName: "HDFC Bank" },
    ]) {
      await ensure(
        () => db.moneyAccount.findFirst({ where: { branchId, name: acc.name } }),
        () => db.moneyAccount.create({ data: { organizationId: orgId, branchId, ...acc } }),
      );
    }
  }

  // --- Device types, brands, models, problems ---
  const deviceTypes: Record<string, string> = {};
  for (const [i, name] of ["Mobile", "Laptop", "Desktop", "Tablet", "Smartwatch", "Other"].entries()) {
    const row = await ensure(
      () => db.deviceType.findFirst({ where: { organizationId: orgId, name } }),
      () => db.deviceType.create({ data: { organizationId: orgId, name, sortOrder: i } }),
    );
    deviceTypes[name] = row.id;
  }
  const brands: Record<string, string> = {};
  for (const name of [
    "Samsung",
    "Apple",
    "Xiaomi",
    "Vivo",
    "Oppo",
    "OnePlus",
    "Realme",
    "Motorola",
    "HP",
    "Dell",
    "Lenovo",
    "Asus",
    "Acer",
  ]) {
    const row = await db.brand.upsert({
      where: { organizationId_name: { organizationId: orgId, name } },
      create: { organizationId: orgId, name },
      update: {},
    });
    brands[name] = row.id;
  }
  const models: [string, string, string][] = [
    ["Samsung", "Mobile", "Galaxy A52"],
    ["Samsung", "Mobile", "Galaxy M31"],
    ["Apple", "Mobile", "iPhone 12"],
    ["Apple", "Mobile", "iPhone 13"],
    ["Xiaomi", "Mobile", "Redmi Note 10"],
    ["Vivo", "Mobile", "Y21"],
    ["OnePlus", "Mobile", "Nord CE 2"],
    ["HP", "Laptop", "Pavilion 15"],
    ["Dell", "Laptop", "Inspiron 3511"],
    ["Lenovo", "Laptop", "IdeaPad Slim 3"],
  ];
  const modelIds: Record<string, string> = {};
  for (const [b, t, name] of models) {
    const row = await db.deviceModel.upsert({
      where: { brandId_deviceTypeId_name: { brandId: brands[b], deviceTypeId: deviceTypes[t], name } },
      create: { brandId: brands[b], deviceTypeId: deviceTypes[t], name },
      update: {},
    });
    modelIds[name] = row.id;
  }
  const problems: Record<string, string> = {};
  for (const [name, type] of [
    ["Display / touch", null],
    ["Charging / battery", null],
    ["Dead / no power", null],
    ["Water damage", null],
    ["Software / boot loop", null],
    ["Speaker / microphone", "Mobile"],
    ["Camera", "Mobile"],
    ["Network / signal", "Mobile"],
    ["Keyboard / trackpad", "Laptop"],
    ["Motherboard (chip-level)", null],
  ] as [string, string | null][]) {
    const row = await ensure(
      () => db.problemCategory.findFirst({ where: { organizationId: orgId, name } }),
      () =>
        db.problemCategory.create({
          data: { organizationId: orgId, name, deviceTypeId: type ? deviceTypes[type] : null },
        }),
    );
    problems[name] = row.id;
  }

  // --- Job statuses (names editable; keys fixed) ---
  const statusDefs: {
    name: string;
    key: JobStatusKey;
    color: string;
    pausesTat?: boolean;
    notifyCustomer?: boolean;
  }[] = [
    { name: "Received", key: "RECEIVED", color: "sky" },
    { name: "Diagnosis", key: "DIAGNOSIS", color: "lavender" },
    { name: "Quote sent", key: "QUOTE_SENT", color: "peach", pausesTat: true, notifyCustomer: true },
    { name: "Approved", key: "APPROVED", color: "mint" },
    { name: "Rejected", key: "REJECTED", color: "peach" },
    { name: "In repair", key: "IN_REPAIR", color: "lavender" },
    { name: "Waiting for parts", key: "WAITING_PARTS", color: "peach", pausesTat: true },
    { name: "Quality check", key: "QC", color: "sky" },
    { name: "Ready for pickup", key: "READY", color: "mint", notifyCustomer: true },
    { name: "Delivered", key: "DELIVERED", color: "mint" },
    { name: "Cancelled", key: "CANCELLED", color: "neutral" },
  ];
  const statuses: Partial<Record<JobStatusKey, string>> = {};
  for (const [i, s] of statusDefs.entries()) {
    const row = await ensure(
      () => db.jobStatus.findFirst({ where: { organizationId: orgId, systemKey: s.key } }),
      () =>
        db.jobStatus.create({
          data: {
            organizationId: orgId,
            name: s.name,
            systemKey: s.key,
            color: s.color,
            sortOrder: i,
            pausesTat: s.pausesTat ?? false,
            notifyCustomer: s.notifyCustomer ?? false,
          },
        }),
    );
    statuses[s.key] = row.id;
  }

  // --- Warranty rules & labour charges ---
  for (const w of [
    { name: "Standard repair", days: 30, isDefault: true },
    { name: "Display replacement", days: 90, problemCategoryId: problems["Display / touch"] },
    { name: "Chip-level motherboard", days: 60, problemCategoryId: problems["Motherboard (chip-level)"] },
    { name: "Water damage", days: 7, problemCategoryId: problems["Water damage"] },
  ]) {
    await ensure(
      () => db.warrantyRule.findFirst({ where: { organizationId: orgId, name: w.name } }),
      () => db.warrantyRule.create({ data: { organizationId: orgId, ...w } }),
    );
  }
  const labour = [
    { name: "Diagnosis fee", amount: 300, sac: "998719" },
    {
      name: "Display replacement labour (mobile)",
      amount: 500,
      sac: "998717",
      type: "Mobile",
      problem: "Display / touch",
    },
    { name: "Charging port replacement", amount: 400, sac: "998717", type: "Mobile", problem: "Charging / battery" },
    {
      name: "Chip-level motherboard repair (mobile)",
      amount: 1500,
      sac: "998717",
      type: "Mobile",
      problem: "Motherboard (chip-level)",
    },
    {
      name: "Laptop keyboard replacement labour",
      amount: 600,
      sac: "998713",
      type: "Laptop",
      problem: "Keyboard / trackpad",
    },
    { name: "Software reinstall / flashing", amount: 500, sac: "998719", problem: "Software / boot loop" },
  ];
  const labourIds: Record<string, string> = {};
  for (const l of labour) {
    const row = await ensure(
      () => db.serviceRate.findFirst({ where: { organizationId: orgId, name: l.name } }),
      () =>
        db.serviceRate.create({
          data: {
            organizationId: orgId,
            name: l.name,
            amount: l.amount,
            hsnSacId: hsn[l.sac],
            taxRateId: rates[18],
            deviceTypeId: l.type ? deviceTypes[l.type] : null,
            problemCategoryId: l.problem ? problems[l.problem] : null,
          },
        }),
    );
    labourIds[l.name] = row.id;
  }

  // --- Part categories, units, vendors ---
  const cats: Record<string, string> = {};
  for (const name of [
    "Displays",
    "Batteries",
    "Charging ports",
    "ICs",
    "Keyboards",
    "Cables & wires",
    "Consumables",
    "Tools",
  ]) {
    const row = await ensure(
      () => db.partCategory.findFirst({ where: { organizationId: orgId, name } }),
      () => db.partCategory.create({ data: { organizationId: orgId, name } }),
    );
    cats[name] = row.id;
  }
  const units: Record<string, string> = {};
  for (const [name, symbol] of [
    ["Piece", "pcs"],
    ["Metre", "m"],
    ["Gram", "g"],
    ["Millilitre", "ml"],
  ]) {
    const row = await ensure(
      () => db.unit.findFirst({ where: { organizationId: orgId, name } }),
      () => db.unit.create({ data: { organizationId: orgId, name, symbol } }),
    );
    units[symbol] = row.id;
  }
  for (const v of [
    {
      name: "Kochi Mobile Spares",
      contactPerson: "Biju P",
      phone: "9846011122",
      gstin: "32ABCPK1234L1Z9",
      stateCode: "32",
      address: "Broadway, Ernakulam",
      paymentTermsDays: 15,
    },
    {
      name: "Chennai IC Hub",
      contactPerson: "Karthik S",
      phone: "9840033344",
      gstin: "33AADFC5678M1Z2",
      stateCode: "33",
      address: "Ritchie Street, Chennai",
      paymentTermsDays: 30,
    },
    {
      name: "Tools India Traders",
      contactPerson: "Rakesh M",
      phone: "9820055566",
      stateCode: "27",
      address: "Lamington Road, Mumbai",
    },
  ]) {
    await ensure(
      () => db.vendor.findFirst({ where: { organizationId: orgId, name: v.name } }),
      () => db.vendor.create({ data: { organizationId: orgId, ...v } }),
    );
  }

  // --- Parts + opening stock ---
  const partDefs: {
    sku: string;
    name: string;
    kind: PartKind;
    cat: string;
    unit: string;
    hsn: string;
    price: number;
    cost: number;
    reorder: number;
    models?: string;
  }[] = [
    {
      sku: "DSP-A52",
      name: "Display assembly – Galaxy A52 (OLED)",
      kind: "SPARE_PART",
      cat: "Displays",
      unit: "pcs",
      hsn: "85177990",
      price: 4500,
      cost: 3100,
      reorder: 2,
      models: "Galaxy A52",
    },
    {
      sku: "DSP-IP12",
      name: "Display assembly – iPhone 12",
      kind: "SPARE_PART",
      cat: "Displays",
      unit: "pcs",
      hsn: "85177990",
      price: 7999,
      cost: 5600,
      reorder: 1,
      models: "iPhone 12",
    },
    {
      sku: "DSP-RN10",
      name: "Display combo – Redmi Note 10",
      kind: "SPARE_PART",
      cat: "Displays",
      unit: "pcs",
      hsn: "85177990",
      price: 2999,
      cost: 1900,
      reorder: 3,
      models: "Redmi Note 10",
    },
    {
      sku: "BAT-M31",
      name: "Battery – Galaxy M31 (6000 mAh)",
      kind: "SPARE_PART",
      cat: "Batteries",
      unit: "pcs",
      hsn: "85076000",
      price: 1499,
      cost: 850,
      reorder: 3,
      models: "Galaxy M31",
    },
    {
      sku: "BAT-IP13",
      name: "Battery – iPhone 13",
      kind: "SPARE_PART",
      cat: "Batteries",
      unit: "pcs",
      hsn: "85076000",
      price: 3499,
      cost: 2200,
      reorder: 2,
      models: "iPhone 13",
    },
    {
      sku: "CHG-TC-UNI",
      name: "Type-C charging port board (universal)",
      kind: "SPARE_PART",
      cat: "Charging ports",
      unit: "pcs",
      hsn: "85177990",
      price: 699,
      cost: 280,
      reorder: 10,
    },
    {
      sku: "IC-PMIC-6360",
      name: "PMIC IC PM6360 (Qualcomm)",
      kind: "IC",
      cat: "ICs",
      unit: "pcs",
      hsn: "85423100",
      price: 1200,
      cost: 520,
      reorder: 5,
    },
    {
      sku: "IC-CHG-SM5714",
      name: "Charging IC SM5714 (Samsung)",
      kind: "IC",
      cat: "ICs",
      unit: "pcs",
      hsn: "85423100",
      price: 650,
      cost: 240,
      reorder: 5,
    },
    {
      sku: "KBD-HP15",
      name: "Keyboard – HP Pavilion 15",
      kind: "SPARE_PART",
      cat: "Keyboards",
      unit: "pcs",
      hsn: "84733099",
      price: 1899,
      cost: 1050,
      reorder: 2,
      models: "Pavilion 15",
    },
    {
      sku: "WIRE-JMP-01",
      name: "Jumper wire 0.01 mm",
      kind: "CONSUMABLE",
      cat: "Cables & wires",
      unit: "m",
      hsn: "85444999",
      price: 20,
      cost: 6,
      reorder: 20,
    },
    {
      sku: "FLUX-RMA",
      name: "RMA-223 solder flux",
      kind: "CONSUMABLE",
      cat: "Consumables",
      unit: "g",
      hsn: "85444999",
      price: 5,
      cost: 2.5,
      reorder: 50,
    },
    {
      sku: "TOOL-HAG-858",
      name: "Hot air rework station 858D",
      kind: "TOOL",
      cat: "Tools",
      unit: "pcs",
      hsn: "82055190",
      price: 0,
      cost: 3400,
      reorder: 0,
    },
  ];
  const parts: Record<string, { id: string; cost: number; price: number }> = {};
  for (const p of partDefs) {
    const row = await db.part.upsert({
      where: { organizationId_sku: { organizationId: orgId, sku: p.sku } },
      create: {
        organizationId: orgId,
        sku: p.sku,
        name: p.name,
        kind: p.kind,
        categoryId: cats[p.cat],
        unitId: units[p.unit],
        hsnSacId: hsn[p.hsn],
        taxRateId: rates[18],
        defaultSalePrice: p.price || null,
        reorderLevel: p.reorder,
        compatibleModels: p.models,
      },
      update: {},
    });
    parts[p.sku] = { id: row.id, cost: p.cost, price: p.price };
  }
  const opening: Record<string, Record<string, number>> = {
    KOC: {
      "DSP-A52": 4,
      "DSP-IP12": 2,
      "DSP-RN10": 6,
      "BAT-M31": 5,
      "BAT-IP13": 1,
      "CHG-TC-UNI": 25,
      "IC-PMIC-6360": 8,
      "IC-CHG-SM5714": 3,
      "KBD-HP15": 2,
      "WIRE-JMP-01": 100,
      "FLUX-RMA": 200,
      "TOOL-HAG-858": 3,
    },
    TVM: {
      "DSP-A52": 2,
      "DSP-RN10": 3,
      "BAT-M31": 2,
      "CHG-TC-UNI": 12,
      "IC-PMIC-6360": 4,
      "WIRE-JMP-01": 50,
      "FLUX-RMA": 100,
      "TOOL-HAG-858": 2,
    },
    CLT: { "DSP-RN10": 2, "BAT-M31": 1, "CHG-TC-UNI": 6, "WIRE-JMP-01": 30, "TOOL-HAG-858": 1 },
  };
  for (const [code, items] of Object.entries(opening)) {
    const branchId = ctx.branchIds[code];
    for (const [sku, qty] of Object.entries(items)) {
      const part = parts[sku];
      const exists = await db.stock.findUnique({ where: { branchId_partId: { branchId, partId: part.id } } });
      if (exists) continue;
      await db.stock.create({ data: { branchId, partId: part.id, qty, avgCost: part.cost } });
      await db.stockMovement.create({
        data: {
          organizationId: orgId,
          branchId,
          partId: part.id,
          type: "OPENING",
          qty,
          unitCost: part.cost,
          balanceAfter: qty,
          avgCostAfter: part.cost,
          note: "Opening stock",
          userId: ctx.userIds["store.koc@demo.test"],
        },
      });
    }
  }

  // --- Demo customers + job cards (Kochi) ---
  if ((await db.jobCard.count({ where: { organizationId: orgId } })) > 0) return;
  const koc = ctx.branchIds.KOC;
  const frontDesk = ctx.userIds["frontdesk.koc@demo.test"];
  const engineer = ctx.userIds["engineer.koc@demo.test"];
  const demo: {
    name: string;
    phone: string;
    type: string;
    brand: string;
    model: string;
    imei?: string;
    serial?: string;
    problem: string;
    reported: string;
    key: JobStatusKey;
    estimate: number;
    daysAgo: number;
    assign?: boolean;
    accessories?: string[];
  }[] = [
    {
      name: "Sreejith Kumar",
      phone: "9847111001",
      type: "Mobile",
      brand: "Samsung",
      model: "Galaxy A52",
      imei: "356789104512345",
      problem: "Display / touch",
      reported: "Screen cracked after a fall, touch not working at the bottom.",
      key: "IN_REPAIR",
      estimate: 5000,
      daysAgo: 2,
      assign: true,
      accessories: ["Back cover"],
    },
    {
      name: "Fathima Nasrin",
      phone: "9847111002",
      type: "Mobile",
      brand: "Xiaomi",
      model: "Redmi Note 10",
      imei: "861234056789012",
      problem: "Charging / battery",
      reported: "Not charging; works only with a particular cable.",
      key: "DIAGNOSIS",
      estimate: 1200,
      daysAgo: 1,
      assign: true,
    },
    {
      name: "George Mathew",
      phone: "9847111003",
      type: "Laptop",
      brand: "HP",
      model: "Pavilion 15",
      serial: "5CD1234XYZ",
      problem: "Keyboard / trackpad",
      reported: "Several keys not working after a tea spill.",
      key: "WAITING_PARTS",
      estimate: 2600,
      daysAgo: 4,
      assign: true,
      accessories: ["Charger", "Bag"],
    },
    {
      name: "Lakshmi Menon",
      phone: "9847111004",
      type: "Mobile",
      brand: "Apple",
      model: "iPhone 13",
      imei: "353912110987654",
      problem: "Dead / no power",
      reported: "Phone dead after charging overnight.",
      key: "RECEIVED",
      estimate: 0,
      daysAgo: 0,
    },
    {
      name: "Anoop Varghese",
      phone: "9847111005",
      type: "Mobile",
      brand: "Samsung",
      model: "Galaxy M31",
      imei: "354321098765432",
      problem: "Charging / battery",
      reported: "Battery drains in two hours, phone heats up.",
      key: "READY",
      estimate: 2000,
      daysAgo: 3,
      assign: true,
    },
  ];
  for (const d of demo) {
    const received = new Date(Date.now() - d.daysAgo * 86_400_000 - 3 * 3_600_000);
    const customer = await db.customer.create({
      data: { organizationId: orgId, branchId: koc, name: d.name, phone: d.phone, city: "Kochi", stateCode: "32" },
    });
    const device = await db.device.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        deviceTypeId: deviceTypes[d.type],
        brandId: brands[d.brand],
        modelId: modelIds[d.model],
        imei: d.imei,
        serialNo: d.serial,
      },
    });
    const jobNo = await reserveNumber(db, koc, "KOC", "JOB_CARD", received);
    const job = await db.jobCard.create({
      data: {
        organizationId: orgId,
        branchId: koc,
        jobNo,
        customerId: customer.id,
        deviceId: device.id,
        receivedAt: received,
        receivedById: frontDesk,
        problemReported: d.reported,
        problemCategoryId: problems[d.problem],
        accessories: d.accessories ?? [],
        estimatedCost: d.estimate || null,
        estimatedAt: new Date(received.getTime() + 3 * 86_400_000),
        statusId: statuses[d.key]!,
        assignedEngineerId: d.assign ? engineer : null,
        readyAt: d.key === "READY" ? new Date() : null,
      },
    });
    await db.jobStatusHistory.create({
      data: { jobCardId: job.id, toStatusId: statuses.RECEIVED!, changedById: frontDesk, createdAt: received },
    });
    if (d.key !== "RECEIVED") {
      await db.jobStatusHistory.create({
        data: {
          jobCardId: job.id,
          fromStatusId: statuses.RECEIVED!,
          toStatusId: statuses[d.key]!,
          changedById: engineer,
          note: "Demo data",
        },
      });
    }
  }

  // Parts and labour on two of them, so invoices can be tried straight away.
  const a52 = await db.jobCard.findFirst({ where: { organizationId: orgId, customer: { phone: "9847111001" } } });
  const m31 = await db.jobCard.findFirst({ where: { organizationId: orgId, customer: { phone: "9847111005" } } });
  for (const [job, sku, labourName] of [
    [a52, "DSP-A52", "Display replacement labour (mobile)"],
    [m31, "BAT-M31", "Charging port replacement"],
  ] as const) {
    if (!job) continue;
    const part = parts[sku];
    const stock = await db.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId: koc, partId: part.id } } });
    const newQty = Number(stock.qty) - 1;
    await db.stock.update({ where: { id: stock.id }, data: { qty: newQty } });
    const jp = await db.jobPart.create({
      data: { jobCardId: job.id, partId: part.id, qty: 1, unitCost: stock.avgCost, unitPrice: part.price },
    });
    await db.stockMovement.create({
      data: {
        organizationId: orgId,
        branchId: koc,
        partId: part.id,
        type: "JOB_ISSUE",
        qty: -1,
        unitCost: stock.avgCost,
        balanceAfter: newQty,
        avgCostAfter: stock.avgCost,
        refType: "JobPart",
        refId: jp.id,
        userId: ctx.userIds["store.koc@demo.test"],
      },
    });
    const rate = labour.find((l) => l.name === labourName)!;
    await db.jobLabour.create({
      data: {
        jobCardId: job.id,
        serviceRateId: labourIds[labourName],
        description: rate.name,
        amount: rate.amount,
        engineerId: engineer,
      },
    });
  }

  void modes;
}
