-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TRUE_FALSE', 'MULTIPLE_CHOICE', 'DEVELOPMENT', 'MATH');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "access_code" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "question_number" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "question_text" TEXT NOT NULL,
    "points" DECIMAL(5,2) NOT NULL,
    "options" JSONB,
    "correct_answer" TEXT,
    "correction_criteria" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attempts" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "student_email" TEXT,
    "device_token" TEXT NOT NULL,
    "results_token" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "is_unlocked" BOOLEAN NOT NULL DEFAULT false,
    "results_sent" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "student_attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer_value" TEXT,
    "points_earned" DECIMAL(5,2),
    "ai_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tests_access_code_key" ON "tests"("access_code");

-- CreateIndex
CREATE INDEX "tests_teacher_id_idx" ON "tests"("teacher_id");

-- CreateIndex
CREATE INDEX "tests_access_code_idx" ON "tests"("access_code");

-- CreateIndex
CREATE INDEX "questions_test_id_idx" ON "questions"("test_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_test_id_question_number_key" ON "questions"("test_id", "question_number");

-- CreateIndex
CREATE UNIQUE INDEX "student_attempts_device_token_key" ON "student_attempts"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "student_attempts_results_token_key" ON "student_attempts"("results_token");

-- CreateIndex
CREATE INDEX "student_attempts_test_id_idx" ON "student_attempts"("test_id");

-- CreateIndex
CREATE INDEX "student_attempts_device_token_idx" ON "student_attempts"("device_token");

-- CreateIndex
CREATE INDEX "student_attempts_results_token_idx" ON "student_attempts"("results_token");

-- CreateIndex
CREATE UNIQUE INDEX "student_attempts_test_id_student_name_key" ON "student_attempts"("test_id", "student_name");

-- CreateIndex
CREATE INDEX "answers_student_attempt_id_idx" ON "answers"("student_attempt_id");

-- CreateIndex
CREATE INDEX "answers_question_id_idx" ON "answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_student_attempt_id_question_id_key" ON "answers"("student_attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attempts" ADD CONSTRAINT "student_attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_student_attempt_id_fkey" FOREIGN KEY ("student_attempt_id") REFERENCES "student_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
