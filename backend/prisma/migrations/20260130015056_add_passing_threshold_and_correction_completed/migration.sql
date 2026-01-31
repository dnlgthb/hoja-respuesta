-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "correction_completed_at" TIMESTAMP(3),
ADD COLUMN     "passing_threshold" INTEGER NOT NULL DEFAULT 60;
