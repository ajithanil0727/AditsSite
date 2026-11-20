import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { assertMoneyAccount, assertPaymentMode, recordMoney } from "@/modules/accounts/money.service";
import { writeAudit } from "@/modules/audit/audit.service";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { computeInvoice, paiseToDecimalString, rupeesToPaise } from "@/modules/tax/gst";
import type { creditNoteSchema } from "./credit-notes.schemas";

/**
 * Credit notes for service invoices AFTER delivery (before delivery an invoice is cancelled instead).
 * Full credit copies the invoice lines; a partial credit is split across the invoice's GST rates in
 * proportion to their value. Optionally pays the money back (service refund in the day book).
 * A credit note reduces service income on its own date (pnl-logic.ts).
 */
/** What can still be credited on an invoice (rupees). */
export async function creditable(invoiceId: string) {
  const [inv, credits] = await Promise.all([
    db.invoice.findUnique({ where: { id: invoiceId }, select: { grandTotal: true } }),
    db.invoice.aggregate({
      where: { originalInvoiceId: invoiceId, kind: "CREDIT_NOTE", status: "ISSUED" },
      _sum: { grandTotal: true },
    }),
  ]);
  if (!inv) return 0;
  return Math.max(0, Math.round((Number(inv.grandTotal) - Number(credits._sum.grandTotal ?? 0)) * 100) / 100);
}

export async function issueCreditNote(ctx: ActionContext, input: z.output<typeof creditNoteSchema>) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: ctx.user.organizationId },
      include: { items: { orderBy: { sortOrder: "asc" } }, jobCard: { include: { status: true } } },
    });
    if (!inv || inv.status !== "ISSUED" || inv.kind === "CREDIT_NOTE" || !inv.jobCard)
      throw new ActionError("Credit notes are for issued repair invoices.");
    if (!canAccessBranch(ctx.user.access, "invoices.credit_note", inv.branchId))
      throw new ActionError("Not your branch.");
    if (inv.jobCard.status.systemKey !== "DELIVERED")
      throw new ActionError("The device hasn't been delivered yet. Cancel the invoice instead.");

    const prior = await tx.invoice.aggregate({
      where: { originalInvoiceId: inv.id, kind: "CREDIT_NOTE", status: "ISSUED" },
      _sum: { grandTotal: true },
    });
    const remaining = rupeesToPaise(Number(inv.grandTotal)) - rupeesToPaise(Number(prior._sum.grandTotal ?? 0));
    const wanted = rupeesToPaise(input.amount);
    if (wanted > remaining)
      throw new ActionError(`At most ₹${(remaining / 100).toFixed(2)} can still be credited on this invoice.`);

    const gstCtx = { registered: !!inv.gstRegistrationId, interState: inv.isInterState, pricesIncludeTax: true };
    const full = wanted === remaining && !prior._sum.grandTotal;
    let lines: {
      description: string;
      hsnSac: string | null;
      kind: (typeof inv.items)[number]["kind"];
      qty: number;
      unitPrice: number;
      taxRate: number;
    }[];
    if (full) {
      lines = inv.items.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        kind: i.kind,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        taxRate: Number(i.taxRate),
      }));
    } else {
      // Split the amount across the invoice's GST rates by value (largest remainder keeps every paisa).
      const groups = new Map<
        number,
        { gross: number; hsnSac: string | null; kind: (typeof inv.items)[number]["kind"] }
      >();
      for (const i of inv.items) {
        const rate = Number(i.taxRate);
        const g = groups.get(rate) ?? { gross: 0, hsnSac: i.hsnSac, kind: i.kind };
        g.gross += rupeesToPaise(Number(i.total));
        groups.set(rate, g);
      }
      const totalGross = [...groups.values()].reduce((a, g) => a + g.gross, 0) || 1;
      const entries = [...groups.entries()].filter(([, g]) => g.gross > 0);
      const raw = entries.map(([, g]) => (wanted * g.gross) / totalGross);
      const alloc = raw.map(Math.floor);
      let left = wanted - alloc.reduce((a, b) => a + b, 0);
      raw
        .map((r, i) => ({ i, f: r - Math.floor(r) }))
        .sort((a, b) => b.f - a.f)
        .forEach(({ i }) => {
          if (left > 0) {
            alloc[i]++;
            left--;
          }
        });
      lines = entries.map(([rate, g], i) => ({
        description: `Credit against invoice ${inv.invoiceNo}${entries.length > 1 ? ` (GST ${rate}%)` : ""}`,
        hsnSac: g.hsnSac,
        kind: g.kind,
        qty: 1,
        unitPrice: alloc[i] / 100,
        taxRate: rate,
      }));
    }
    const calc = computeInvoice(
      lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate })),
      gstCtx,
    );
    if (calc.grandTotal > remaining)
      throw new ActionError(
        "Rounding takes the credit note over what can be credited. Enter a slightly smaller amount.",
      );

    const creditNo = await nextDocNumber(tx, { branchId: inv.branchId, docType: "CREDIT_NOTE" });
    const cn = await tx.invoice.create({
      data: {
        organizationId: inv.organizationId,
        branchId: inv.branchId,
        kind: "CREDIT_NOTE",
        invoiceNo: creditNo,
        invoiceDate: istDateOnly(new Date()),
        status: "ISSUED",
        gstRegistrationId: inv.gstRegistrationId,
        sellerSnapshot: inv.sellerSnapshot ?? {},
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        customerAddress: inv.customerAddress,
        customerGstin: inv.customerGstin,
        placeOfSupply: inv.placeOfSupply,
        isInterState: inv.isInterState,
        jobCardId: inv.jobCardId,
        customerId: inv.customerId,
        originalInvoiceId: inv.id,
        subtotal: paiseToDecimalString(calc.subtotal),
        discountTotal: paiseToDecimalString(calc.discountTotal),
        cgstTotal: paiseToDecimalString(calc.cgstTotal),
        sgstTotal: paiseToDecimalString(calc.sgstTotal),
        igstTotal: paiseToDecimalString(calc.igstTotal),
        roundOff: paiseToDecimalString(calc.roundOff),
        grandTotal: paiseToDecimalString(calc.grandTotal),
        notes: input.reason,
        createdById: ctx.user.id,
        items: {
          create: lines.map((l, i) => ({
            kind: l.kind,
            description: l.description,
            hsnSac: l.hsnSac,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxableValue: paiseToDecimalString(calc.lines[i].taxable),
            taxRate: calc.lines[i].taxRate,
            cgst: paiseToDecimalString(calc.lines[i].cgst),
            sgst: paiseToDecimalString(calc.lines[i].sgst),
            igst: paiseToDecimalString(calc.lines[i].igst),
            total: paiseToDecimalString(calc.lines[i].total),
            sortOrder: i,
          })),
        },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Invoice",
      entityId: cn.id,
      branchId: cn.branchId,
      after: {
        kind: "CREDIT_NOTE",
        invoiceNo: creditNo,
        against: inv.invoiceNo,
        total: Number(cn.grandTotal),
        reason: input.reason,
      },
    });

    if (input.refund) {
      await assertPaymentMode(tx, inv.organizationId, input.paymentModeId!, input.reference);
      await assertMoneyAccount(tx, input.moneyAccountId!, inv.branchId);
      const amount = Number(cn.grandTotal);
      const receiptNo = await nextDocNumber(tx, { branchId: inv.branchId, docType: "SERVICE_RECEIPT" });
      const pay = await tx.servicePayment.create({
        data: {
          organizationId: inv.organizationId,
          branchId: inv.branchId,
          jobCardId: inv.jobCardId!,
          invoiceId: inv.id,
          receiptNo,
          kind: "REFUND",
          paidAt: new Date(),
          amount,
          paymentModeId: input.paymentModeId!,
          moneyAccountId: input.moneyAccountId!,
          reference: input.reference,
          receivedById: ctx.user.id,
        },
      });
      await recordMoney(tx, {
        organizationId: inv.organizationId,
        branchId: inv.branchId,
        moneyAccountId: input.moneyAccountId!,
        date: istDateOnly(new Date()),
        direction: "OUT",
        amount,
        source: "SERVICE_REFUND",
        refType: "ServicePayment",
        refId: pay.id,
        narration: `Refund · credit note ${creditNo} against ${inv.invoiceNo}`,
        createdById: ctx.user.id,
      });
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: Math.round((Number(inv.amountPaid) - amount) * 100) / 100 },
      });
    }
    return { id: cn.id, creditNo };
  });
}
