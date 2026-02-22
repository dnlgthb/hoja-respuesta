-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "context" TEXT,
ADD COLUMN     "has_image" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image_description" TEXT,
ADD COLUMN     "image_page" INTEGER;
