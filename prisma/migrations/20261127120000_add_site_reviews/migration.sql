-- CreateEnum
CREATE TYPE "SiteReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Add new notification types for site review moderation outcomes
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SITE_REVIEW_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SITE_REVIEW_REJECTED';

-- CreateTable
CREATE TABLE "site_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "text" TEXT NOT NULL,
    "status" "SiteReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" VARCHAR(255),
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_reviews_userId_key" ON "site_reviews"("userId");

-- CreateIndex
CREATE INDEX "site_reviews_status_createdAt_idx" ON "site_reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "site_reviews_rating_createdAt_idx" ON "site_reviews"("rating", "createdAt");

-- AddForeignKey
ALTER TABLE "site_reviews" ADD CONSTRAINT "site_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
