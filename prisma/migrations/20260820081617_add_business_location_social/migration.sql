/*
  Warnings:

  - A unique constraint covering the columns `[nationalId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "city" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mapLink" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "socialMedia" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nationalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_nationalId_key" ON "users"("nationalId");
