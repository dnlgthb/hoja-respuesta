-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "institution_id" TEXT;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "is_institution_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "courses_institution_id_idx" ON "courses"("institution_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
