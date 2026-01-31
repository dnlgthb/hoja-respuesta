-- AlterTable
ALTER TABLE "student_attempts" ADD COLUMN     "spelling_score" DOUBLE PRECISION,
ADD COLUMN     "spelling_writing_feedback" TEXT,
ADD COLUMN     "writing_score" DOUBLE PRECISION;
