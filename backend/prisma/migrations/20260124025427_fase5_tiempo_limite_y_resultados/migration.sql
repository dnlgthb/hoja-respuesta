-- AlterTable
ALTER TABLE "student_attempts" ADD COLUMN     "results_sent_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "ends_at" TIMESTAMP(3);
