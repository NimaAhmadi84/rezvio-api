-- ═══════════════════════════════════════════════════════════════
-- Booking no-overlap constraint (staff level)
-- ═══════════════════════════════════════════════════════════════
-- Defense-in-depth: حتی اگه service logic اشتباه کنه، DB جلوی
-- double-booking روی یک staff رو می‌گیره.
--
-- Rule matches service logic:
--   A.start < B.end AND A.end > B.start  (روی همان staffId)
--   فقط برای status ≠ CANCELLED و staffId IS NOT NULL
-- ═══════════════════════════════════════════════════════════════

-- 1) btree_gist لازم است تا gist index روی ستون متنی "staffId" با اپراتور = کار کند
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) EXCLUDE constraint
-- tsrange با '[)' یعنی start inclusive، end exclusive —
-- دقیقاً هم‌راستا با rule سرویس.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_no_overlap"
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startTime", "endTime", '[)') WITH &&
) WHERE (status <> 'CANCELLED' AND "staffId" IS NOT NULL);
