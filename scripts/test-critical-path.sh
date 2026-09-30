#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Phase 3 Critical Path Test — Auth + Booking flow
# ═══════════════════════════════════════════════════════════════
# تست کامل جریان درآمدی: Login → Me → Slots → Book → My → Cancel
# → Refresh → Logout
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

# ─── cleanup trap (cancel booked reservations) ───
BOOKED_ID=""
ACCESS_TOKEN=""
cleanup() {
  if [ -n "$BOOKED_ID" ] && [ -n "$ACCESS_TOKEN" ]; then
    curl -s -X PATCH "$API_URL/bookings/$BOOKED_ID/cancel-with-reason" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"reason":"cleanup after test run"}' >/dev/null 2>&1
  fi
}
trap cleanup EXIT

echo "════════════════════════════════════════════════════════"
echo "Phase 3 — Critical Path Test"
echo "API: $API_URL"
echo "════════════════════════════════════════════════════════"

# ──────── Step 1: Login ────────
echo ""
info "Step 1: Login with test account"
LOGIN=$(curl -s -X POST "$API_URL/auth/login-password" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"rememberMe\":false}")

ACCESS_TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // empty')
REFRESH_TOKEN=$(echo "$LOGIN" | jq -r '.refreshToken // empty')
SESSION_ID=$(echo "$LOGIN" | jq -r '.sessionId // empty')
ROLE=$(echo "$LOGIN" | jq -r '.user.role // empty')

if [ -n "$ACCESS_TOKEN" ] && [ -n "$REFRESH_TOKEN" ]; then
  ok "Login successful (role: $ROLE, sessionId: ${SESSION_ID:0:8}...)"
else
  ko "Login failed — raw response: $LOGIN"
  exit 1
fi

# ──────── Step 2: /auth/me ────────
echo ""
info "Step 2: GET /auth/me"
ME=$(curl -s "$API_URL/auth/me" -H "Authorization: Bearer $ACCESS_TOKEN")
ME_ID=$(echo "$ME" | jq -r '.id // empty')
if [ -n "$ME_ID" ]; then
  ok "/auth/me returned user (id: ${ME_ID:0:8}...)"
else
  ko "/auth/me failed — raw: $ME"
fi

# ──────── Step 3: get business by slug ────────
echo ""
info "Step 3: GET business by slug ($BUSINESS_SLUG)"
BIZ=$(curl -s "$API_URL/businesses/slug/$BUSINESS_SLUG")
BIZ_ID=$(echo "$BIZ" | jq -r '.id // empty')
SERVICE_ID=$(echo "$BIZ" | jq -r '.services[0].id // empty')
STAFF_ID=$(echo "$BIZ" | jq -r '.staff[0].id // empty')

if [ -n "$BIZ_ID" ] && [ -n "$SERVICE_ID" ] && [ -n "$STAFF_ID" ]; then
  ok "Business loaded (services: $(echo "$BIZ" | jq '.services | length'), staff: $(echo "$BIZ" | jq '.staff | length'))"
else
  ko "Business data missing (biz=$BIZ_ID svc=$SERVICE_ID staff=$STAFF_ID)"
  exit 1
fi

# ──────── Step 4: find an available slot ────────
echo ""
info "Step 4: find available slot (next 7 days)"
SLOT=""
SLOT_DATE=""
for i in 1 2 3 4 5 6 7; do
  DATE=$(date -u -d "+$i days" +%Y-%m-%d 2>/dev/null || date -u -v+"${i}"d +%Y-%m-%d 2>/dev/null)
  if [ -z "$DATE" ]; then
    ko "date command does not support relative dates"
    exit 1
  fi
  SLOT_RESP=$(curl -s "$API_URL/businesses/$BUSINESS_SLUG/slots?serviceId=$SERVICE_ID&staffId=$STAFF_ID&date=$DATE")
  SLOT=$(echo "$SLOT_RESP" | jq -r '.slots[0].startTime // .slots[0] // empty')
  if [ -n "$SLOT" ]; then
    SLOT_DATE="$DATE"
    break
  fi
done

if [ -n "$SLOT" ]; then
  ok "Slot found on $SLOT_DATE: $SLOT"
else
  ko "No slot found in next 7 days — aborting booking test"
  # don't exit — other tests can still run
fi

# ──────── Step 5: create booking ────────
echo ""
info "Step 5: POST /bookings"
if [ -n "$SLOT" ]; then
  BOOK=$(curl -s -X POST "$API_URL/bookings" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"${SLOT_DATE}T${SLOT}:00\",\"paymentMethod\":\"IN_PERSON\"}")
  BOOKED_ID=$(echo "$BOOK" | jq -r '.id // empty')
  BOOK_STATUS=$(echo "$BOOK" | jq -r '.status // empty')
  if [ -n "$BOOKED_ID" ]; then
    ok "Booking created (id: ${BOOKED_ID:0:8}..., status: $BOOK_STATUS)"
  else
    ko "Booking failed — raw: $BOOK"
  fi
else
  info "skipped (no slot)"
fi

# ──────── Step 6: my-bookings ────────
echo ""
info "Step 6: GET /bookings/my-bookings"
MY=$(curl -s "$API_URL/bookings/my-bookings" -H "Authorization: Bearer $ACCESS_TOKEN")
MY_COUNT=$(echo "$MY" | jq 'length // 0')
if [ "$MY_COUNT" -gt 0 ]; then
  ok "My bookings returned $MY_COUNT item(s)"
else
  ko "My bookings empty — raw: $MY"
fi

# ──────── Step 7: cancel with reason ────────
echo ""
info "Step 7: PATCH cancel-with-reason"
if [ -n "$BOOKED_ID" ]; then
  CANCEL=$(curl -s -X PATCH "$API_URL/bookings/$BOOKED_ID/cancel-with-reason" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"تست خودکار پایپلاین критиکال"}')
  CANCEL_STATUS=$(echo "$CANCEL" | jq -r '.status // empty')
  if [ "$CANCEL_STATUS" = "CANCELLED" ]; then
    ok "Booking cancelled (status: CANCELLED)"
    BOOKED_ID="" # cleanup already done
  else
    ko "Cancel failed — raw: $CANCEL"
  fi
else
  info "skipped (no booking)"
fi

# ──────── Step 8: refresh token ────────
echo ""
info "Step 8: POST /auth/refresh"
REFRESH=$(curl -s -X POST "$API_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -H "X-Current-Session-Id: $SESSION_ID" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
NEW_ACCESS=$(echo "$REFRESH" | jq -r '.accessToken // empty')
if [ -n "$NEW_ACCESS" ]; then
  ok "Refresh successful"
  ACCESS_TOKEN="$NEW_ACCESS"
else
  ko "Refresh failed — raw: $REFRESH"
fi

# ──────── Step 9: logout ────────
echo ""
info "Step 9: POST /auth/logout"
LOGOUT=$(curl -s -X POST "$API_URL/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Current-Session-Id: $SESSION_ID")
LOGOUT_MSG=$(echo "$LOGOUT" | jq -r '.message // empty')
if [ -n "$LOGOUT_MSG" ]; then
  ok "Logout successful"
else
  ko "Logout failed — raw: $LOGOUT"
fi

# ──────── Step 10: verify revoked ────────
echo ""
info "Step 10: verify session is revoked (expect 401 on refresh)"
REFRESH2=$(curl -s -X POST "$API_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -H "X-Current-Session-Id: $SESSION_ID" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
REFRESH2_STATUS=$(echo "$REFRESH2" | jq -r '.statusCode // empty')
if [ "$REFRESH2_STATUS" = "401" ]; then
  ok "Refresh after logout rejected with 401"
else
  ko "Expected 401 but got: $REFRESH2"
fi

# ──────── Summary ────────
echo ""
echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All tests PASSED ($PASS/$PASS)${NC}"
  exit 0
else
  echo -e "${RED}$FAIL failed, $PASS passed${NC}"
  exit 1
fi
