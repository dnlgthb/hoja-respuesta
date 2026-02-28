-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "require_units" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_one_at_a_time" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit_penalty" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
