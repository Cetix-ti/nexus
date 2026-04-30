-- CreateEnum
CREATE TYPE "CategoryScope" AS ENUM ('CLIENT', 'INTERNAL');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "scope" "CategoryScope" NOT NULL DEFAULT 'CLIENT';

-- CreateIndex
CREATE INDEX "categories_scope_is_active_idx" ON "categories"("scope", "is_active");
