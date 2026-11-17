import "server-only";
import type { DocType } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { financialYear } from "@/lib/fy";
import { DEFAULT_FORMATS, formatDocNumber } from "./format";

/**
 * Reserve the next number for a document. MUST be called inside the same transaction
 * that creates the document, so a rolled-back document doesn't burn a number.
 *
 * The increment is a single atomic UPDATE ... RETURNING, so concurrent requests
 * never get the same number.
 */
export async function nextDocNumber(
  tx: Tx,
  opts: { branchId: string; docType: DocType; date?: Date },
): Promise<string> {
  const date = opts.date ?? new Date();
  const branch = await tx.branch.findUniqueOrThrow({
    where: { id: opts.branchId },
    select: { code: true, organizationId: true },
  });

  // Format settings come from the most recent series row for this branch + doc type.
  const template = await tx.numberSeries.findFirst({
    where: { branchId: opts.branchId, docType: opts.docType },
    orderBy: { updatedAt: "desc" },
  });
  const resetPolicy = template?.resetPolicy ?? "FINANCIAL_YEAR";
  const fyKey = resetPolicy === "NEVER" ? "ALL" : financialYear(date);
  const defaults = DEFAULT_FORMATS[opts.docType];

  const series = await tx.numberSeries.upsert({
    where: {
      branchId_docType_financialYear: { branchId: opts.branchId, docType: opts.docType, financialYear: fyKey },
    },
    create: {
      organizationId: branch.organizationId,
      branchId: opts.branchId,
      docType: opts.docType,
      financialYear: fyKey,
      format: template?.format ?? defaults.format,
      padding: template?.padding ?? defaults.padding,
      resetPolicy,
      nextNumber: 2, // we are using 1 right now
    },
    update: { nextNumber: { increment: 1 } },
  });

  return formatDocNumber({
    format: series.format,
    branchCode: branch.code,
    date,
    seq: series.nextNumber - 1,
    padding: series.padding,
  });
}
