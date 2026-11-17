/*
  Warnings:

  - You are about to drop the `InvoicePayment` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'PAYMENT', 'REFUND');

-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'SERVICE_RECEIPT';

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_moneyAccountId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_paymentModeId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_receivedById_fkey";

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "deliveredOnCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unlockCodeEnc" TEXT,
ADD COLUMN     "unlockRevealedAt" TIMESTAMP(3),
ADD COLUMN     "unlockRevealedById" TEXT,
ADD COLUMN     "warrantyPartsFree" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "InvoicePayment";

-- CreateTable
CREATE TABLE "ServicePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "receiptNo" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentModeId" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePayment_jobCardId_idx" ON "ServicePayment"("jobCardId");

-- CreateIndex
CREATE INDEX "ServicePayment_branchId_paidAt_idx" ON "ServicePayment"("branchId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePayment_organizationId_receiptNo_key" ON "ServicePayment"("organizationId", "receiptNo");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_unlockRevealedById_fkey" FOREIGN KEY ("unlockRevealedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "PaymentMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
