-- AlterTable
ALTER TABLE "Incentive" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "requestedById" TEXT;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "summary" JSONB;

-- AlterTable
ALTER TABLE "SalaryAdvance" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT;

