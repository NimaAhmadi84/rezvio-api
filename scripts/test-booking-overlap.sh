#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Phase 4 — Booking Overlap Race Test
# ═══════════════════════════════════════════════════════════════
# تست: double-book روی یه staff در همون slot باید با
# 409 + code=BOOKING_OVERLAP رد بشه (DB constraint + filter map).
# ═══════════════════════════════════════════════════════════════

set -u

API_URL="${API_URL:-http://localhost:3001}"
TEST_EMAIL="${TEST_EMAIL:-mrnima2921@gmail.com}"
TEST_PASSWORD="${TEST_PASSWORD:-NimaAhmadi\$_84}"
BUSINESS_SLUG="${BUSINESS_SLUG:-nimabaebershop}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YEL='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
ok()   { echo -e "${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
ko()   { echo -e "${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }
info() { echo -e "${YEL}ℹ️  $1${NC}"; }

BOOKED_ID=""
ACCESS_TOKEN=""
cleanup() {
  if [ -n "$BOOKED_ID" ] && [ -n "$ACCESS_TOKEN" ]; then
    curl -s -X PATCH "$API_URL/bookings/$BOOKED_ID/cancel-with-reason" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"reason":"cleanup after overlap test"}' >/dev/null 2>&1
  fi
}
trap cleanup EXIT

echo "════════════════════════════════════════════════════════"
echo "Phase 4 — Booking Overlap Race Test"
echo "API: $API_URL"
echo "════════════════════════════════════════════════════════"

info "Login"
LOGIN=$(curl -s -X POST "$API_URL/auth/login-password" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"rememberMe\":false}")
ACCESS_TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // empty')
if [ -z "$ACCESS_TOKEN" ]; then
  ko "Login failed — raw: $LOGIN"
  exit 1
fi
ok "Login ok"

info "Get business"
BIZ=$(curl -s "$API_URL/businesses/slug/$BUSINESS_SLUG")
BIZ_ID=$(echo "$BIZ" | jq -r '.id // empty')
SERVICE_ID=$(echo "$BIZ" | jq -r '.services[0].id // empty')
STAFF_ID=$(echo "$BIZ" | jq -r '.staff[0].id // empty')
if [ -z "$BIZ_ID" ]; then
  ko "Business missing"
  exit 1
fi

info "Find free slot"
SLOT=""
SLOT_DATE=""
for i in 1 2 3 4 5 6 7; do
  DATE=$(date -u -d "+$i days" +%Y-%m-%d 2>/dev/null)
  SLOT_RESP=$(curl -s "$API_URL/businesses/$BUSINESS_SLUG/slots?serviceId=$SERVICE_ID&staffId=$STAFF_ID&date=$DATE")
  SLOT=$(echo "$SLOT_RESP" | jq -r '.slots[0].startTime // empty')
  if [ -n "$SLOT" ]; then
    SLOT_DATE="$DATE"
    break
  fi
done
if [ -z "$SLOT" ]; then
  ko "No slot found in next 7 days"
  exit 1
fi
ok "Slot: ${SLOT_DATE}T${SLOT}:00"

FULL_START="${SLOT_DATE}T${SLOT}:00"

info "Create first booking"
BOOK1=$(curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"$FULL_START\",\"paymentMethod\":\"IN_PERSON\"}")
BOOKED_ID=$(echo "$BOOK1" | jq -r '.id // empty')
if [ -n "$BOOKED_ID" ]; then
  ok "First booking created: ${BOOKED_ID:0:8}..."
else
  ko "First booking failed — raw: $BOOK1"
  exit 1
fi

info "Attempt double-book on the SAME slot"
BOOK2=$(curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"$FULL_START\",\"paymentMethod\":\"IN_PERSON\"}")

STATUS2=$(echo "$BOOK2" | jq -r '.statusCode // empty')
CODE2=$(echo "$BOOK2" | jq -r '.code // empty')

if [ "$STATUS2" = "409" ] && [ "$CODE2" = "BOOKING_OVERLAP" ]; then
  ok "Double-book blocked: 409 BOOKING_OVERLAP"
else
  ko "Expected 409 BOOKING_OVERLAP, got: $BOOK2"
fi

echo ""
echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All tests PASSED ($PASS/$PASS)${NC}"
  exit 0
else
  echo -e "${RED}$FAIL failed, $PASS passed${NC}"
  exit 1
fi
