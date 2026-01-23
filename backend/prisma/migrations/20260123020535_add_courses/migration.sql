-- AlterTable
ALTER TABLE "student_attempts" ADD COLUMN     "course_student_id" TEXT;

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "course_id" TEXT;

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_students" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "student_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

-- CreateIndex
CREATE INDEX "course_students_course_id_idx" ON "course_students"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_students_course_id_student_name_key" ON "course_students"("course_id", "student_name");

-- CreateIndex
CREATE INDEX "student_attempts_course_student_id_idx" ON "student_attempts"("course_student_id");

-- CreateIndex
CREATE INDEX "tests_course_id_idx" ON "tests"("course_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_students" ADD CONSTRAINT "course_students_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attempts" ADD CONSTRAINT "student_attempts_course_student_id_fkey" FOREIGN KEY ("course_student_id") REFERENCES "course_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
