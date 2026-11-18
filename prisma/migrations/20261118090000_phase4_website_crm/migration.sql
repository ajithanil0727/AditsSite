-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadActivityKind" ADD VALUE 'ENQUIRY';
ALTER TYPE "LeadActivityKind" ADD VALUE 'CONVERSION';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "showFeeOnWebsite" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "enquiryCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "jobCardId" TEXT,
ADD COLUMN     "lastEnquiryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_enrollmentId_key" ON "Lead"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_jobCardId_key" ON "Lead"("jobCardId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

