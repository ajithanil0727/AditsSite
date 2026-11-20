-- DropIndex
DROP INDEX "Certificate_enrollmentId_key";

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AssessmentResult" ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "attendancePct" DECIMAL(5,2),
ADD COLUMN     "percentage" DECIMAL(5,2),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "placementOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlacementApplication" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PlacementDrive" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Assessment_batchId_idx" ON "Assessment"("batchId");

-- CreateIndex
CREATE INDEX "Certificate_enrollmentId_idx" ON "Certificate"("enrollmentId");

