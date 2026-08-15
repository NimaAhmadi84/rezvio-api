-- CreateIndex
CREATE INDEX "businesses_categoryId_idx" ON "businesses"("categoryId");

-- CreateIndex
CREATE INDEX "businesses_viewsCount_idx" ON "businesses"("viewsCount");

-- CreateIndex
CREATE INDEX "businesses_bookingsCount_idx" ON "businesses"("bookingsCount");

-- CreateIndex
CREATE INDEX "businesses_createdAt_idx" ON "businesses"("createdAt");
