-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_businessId_fkey";

-- DropForeignKey
ALTER TABLE "business_hours" DROP CONSTRAINT "business_hours_businessId_fkey";

-- DropForeignKey
ALTER TABLE "holidays" DROP CONSTRAINT "holidays_businessId_fkey";

-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_businessId_fkey";

-- DropForeignKey
ALTER TABLE "staff" DROP CONSTRAINT "staff_businessId_fkey";

-- DropForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT "staff_services_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT "staff_services_staffId_fkey";

-- DropIndex
DROP INDEX "business_hours_businessId_dayOfWeek_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE INDEX "bookings_businessId_startTime_idx" ON "bookings"("businessId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_staffId_startTime_idx" ON "bookings"("staffId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_customerId_idx" ON "bookings"("customerId");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
