-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "justification" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "require_units" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit_penalty" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- AlterTable
ALTER TABLE "student_attempts" ADD COLUMN     "paste_attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "evaluate_spelling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evaluate_writing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "false_justification_penalty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "require_false_justification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spelling_points" DOUBLE PRECISION,
ADD COLUMN     "writing_points" DOUBLE PRECISION;
