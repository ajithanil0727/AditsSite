-- AlterTable
ALTER TABLE "ProfitDistributionLine" ADD COLUMN     "segmentFrom" DATE,
ADD COLUMN     "segmentTo" DATE;

-- AlterTable
ALTER TABLE "ProfitDistributionRun" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "summary" JSONB;

