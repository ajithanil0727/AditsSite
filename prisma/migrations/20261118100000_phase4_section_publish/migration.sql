-- AlterTable
ALTER TABLE "PageSection" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "publishedSortOrder" INTEGER,
ADD COLUMN     "publishedVisible" BOOLEAN NOT NULL DEFAULT false;

