-- CreateTable (با IF NOT EXISTS برای امنیت)
CREATE TABLE IF NOT EXISTS "staff_breaks" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_breaks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "staff_date_breaks" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_date_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_breaks_staffId_dayOfWeek_idx" ON "staff_breaks"("staffId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "staff_date_breaks_staffId_date_idx" ON "staff_date_breaks"("staffId", "date");

-- AddForeignKey (با DO NOTHING برای امنیت)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'staff_breaks_staffId_fkey'
    ) THEN
        ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_staffId_fkey" 
            FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'staff_date_breaks_staffId_fkey'
    ) THEN
        ALTER TABLE "staff_date_breaks" ADD CONSTRAINT "staff_date_breaks_staffId_fkey" 
            FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;