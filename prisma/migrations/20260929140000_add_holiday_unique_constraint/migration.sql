-- AddUniqueConstraint: یک تاریخ خاص در یک کسب‌وکار نباید دو بار تعطیل ثبت شود
CREATE UNIQUE INDEX "holidays_businessId_date_key" ON "holidays"("businessId", "date");