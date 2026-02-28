-- AlterTable
ALTER TABLE "teachers" ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "teachers" ADD COLUMN "verification_token" TEXT;
ALTER TABLE "teachers" ADD COLUMN "reset_token" TEXT;
ALTER TABLE "teachers" ADD COLUMN "reset_token_exp" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_verification_token_key" ON "teachers"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_reset_token_key" ON "teachers"("reset_token");
