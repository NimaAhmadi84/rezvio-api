-- Performance indexes for tenant-scoped queries.
-- These tables are small now (Seq Scan is fine), but scale fast with tenants.
-- Adding indexes now keeps queries under 1ms as data grows.

CREATE INDEX "staff_businessId_idx" ON "staff"("businessId");
CREATE INDEX "services_businessId_idx" ON "services"("businessId");
CREATE INDEX "business_hours_businessId_idx" ON "business_hours"("businessId");
