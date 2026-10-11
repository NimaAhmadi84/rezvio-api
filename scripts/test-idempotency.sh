#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Test: Idempotency Key for POST /bookings (Pre-Deploy Audit Step 1)
# ═══════════════════════════════════════════════════════════════
# Verifies:
#   1. Sequential duplicate key → cached response, same booking id
#   2. Parallel duplicate key  → race-safe, same booking id (only 1 row)
#   3. Different key on already-taken slot → 409 BOOKING_OVERLAP
#   4. Fresh key on free slot  → 201 new booking
#
# Self-cleaning (cancels test bookings on exit).
#
# Usage:
#   TEST_EMAIL='...' TEST_PASSWORD='...' BUSINESS_SLUG='...' \
#     bash scripts/test-idempotency.sh
#
# Env vars (all optional except TEST_EMAIL/TEST_PASSWORD):
#   API_URL           (default: http://localhost:3001)
#   TEST_EMAIL        (default: mrnima2921@gmail.com)
#   TEST_PASSWORD     (required if no default)
#   BUSINESS_SLUG     (default: nimabaebershop)
# ═══════════════════════════════════════════════════════════════
set -u

API_URL="${API_URL:-http://localhost:3001}"
TEST_EMAIL="${TEST_EMAIL:-mrnima2921@gmail.com}"
TEST_PASSWORD="${TEST_PASSWORD:?TEST_PASSWORD required}"
BUSINESS_SLUG="${BUSINESS_SLUG:-nimabaebershop}"

command -v jq >/dev/null || { echo "❌ jq is not installed"; exit 1; }
command -v node >/dev/null || { echo "❌ node is not installed (needed for UUID)"; exit 1; }

# ──── state ────
ACCESS_TOKEN=""
BIZ_ID=""
SERVICE_ID=""
STAFF_ID=""
BOOKING_IDS=()

# ──── counters ────
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "❌ $1"; }
info() { echo "ℹ️  $1"; }

# ──── helpers ────
uuid() { node -e "console.log(require('crypto').randomUUID())"; }

cleanup() {
  if [ "${#BOOKING_IDS[@]}" -eq 0 ] || [ -z "$ACCESS_TOKEN" ]; then return; fi
  info "Cleanup: cancelling ${#BOOKING_IDS[@]} test booking(s)..."
  for BID in "${BOOKING_IDS[@]}"; do
    curl -s -X PATCH "$API_URL/bookings/$BID/cancel-with-reason" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"reason":"cleanup after idempotency test"}' >/dev/null 2>&1
  done
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
# Setup
# ═══════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  Idempotency Key Test — POST /bookings"
echo "  API:      $API_URL"
echo "  Business: $BUSINESS_SLUG"
echo "════════════════════════════════════════════════════════════"

info "Login"
LOGIN=$(curl -s -X POST "$API_URL/auth/login-password" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"rememberMe\":false}")
ACCESS_TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // empty')
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  bad "Login failed: $(echo "$LOGIN" | head -c 200)"
  exit 1
fi
ok "Login ok"

info "Fetch business"
BIZ=$(curl -s "$API_URL/businesses/slug/$BUSINESS_SLUG")
BIZ_ID=$(echo "$BIZ" | jq -r '.id // empty')
SERVICE_ID=$(echo "$BIZ" | jq -r '.services[0].id // empty')
STAFF_ID=$(echo "$BIZ" | jq -r '.staff[0].id // empty')
if [ -z "$BIZ_ID" ] || [ "$BIZ_ID" = "null" ]; then
  bad "Business not found: $BUSINESS_SLUG"
  exit 1
fi
if [ -z "$SERVICE_ID" ] || [ "$SERVICE_ID" = "null" ]; then
  bad "No service found in business"
  exit 1
fi
if [ -z "$STAFF_ID" ] || [ "$STAFF_ID" = "null" ]; then
  bad "No staff found in business"
  exit 1
fi
ok "Business resolved (id=${BIZ_ID:0:8}...)"

# ──── find two free slots on different dates ────
info "Searching for two free slots (next 14 days)..."
SLOT_A_DATE=""; SLOT_A_TIME=""
SLOT_B_DATE=""; SLOT_B_TIME=""
for i in $(seq 1 14); do
  DATE=$(date -u -d "+$i days" +%Y-%m-%d 2>/dev/null)
  [ -z "$DATE" ] && continue
  RESP=$(curl -s "$API_URL/businesses/$BUSINESS_SLUG/slots?serviceId=$SERVICE_ID&staffId=$STAFF_ID&date=$DATE")
  COUNT=$(echo "$RESP" | jq '.slots | length // 0')
  if [ "$COUNT" -ge 1 ] && [ -z "$SLOT_A_TIME" ]; then
    SLOT_A_DATE="$DATE"
    SLOT_A_TIME=$(echo "$RESP" | jq -r '.slots[0].startTime')
  elif [ "$COUNT" -ge 1 ] && [ -z "$SLOT_B_TIME" ]; then
    SLOT_B_DATE="$DATE"
    SLOT_B_TIME=$(echo "$RESP" | jq -r '.slots[0].startTime')
    break
  fi
done
if [ -z "$SLOT_A_TIME" ] || [ -z "$SLOT_B_TIME" ]; then
  bad "Could not find two free slots in next 14 days"
  exit 1
fi
ok "Slot A: ${SLOT_A_DATE}T${SLOT_A_TIME}:00"
ok "Slot B: ${SLOT_B_DATE}T${SLOT_B_TIME}:00"

# ═══════════════════════════════════════════════════════════════
# Test 1: Sequential duplicate key → same booking id
# ═══════════════════════════════════════════════════════════════
echo ""
info "Test 1: Sequential duplicate idempotency key"

K1=$(uuid)
BODY_A="{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"${SLOT_A_DATE}T${SLOT_A_TIME}:00\",\"paymentMethod\":\"IN_PERSON\",\"idempotencyKey\":\"$K1\"}"

POST1=$(curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $K1" \
  -d "$BODY_A")
ID1=$(echo "$POST1" | jq -r '.id // empty')
if [ -z "$ID1" ] || [ "$ID1" = "null" ]; then
  bad "First POST failed: $(echo "$POST1" | head -c 300)"
  exit 1
fi
ok "First POST created booking ${ID1:0:8}..."

POST2=$(curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $K1" \
  -d "$BODY_A")
ID2=$(echo "$POST2" | jq -r '.id // empty')

if [ "$ID1" = "$ID2" ] && [ -n "$ID2" ] && [ "$ID2" != "null" ]; then
  ok "Test 1 PASS: duplicate key returned SAME id (${ID1:0:8}...)"
  BOOKING_IDS+=("$ID1")
else
  bad "Test 1 FAIL: expected same id, got id1=$ID1 id2=$ID2"
  echo "   POST2 body: $(echo "$POST2" | head -c 300)"
  [ -n "$ID1" ] && [ "$ID1" != "null" ] && BOOKING_IDS+=("$ID1")
  [ -n "$ID2" ] && [ "$ID2" != "null" ] && BOOKING_IDS+=("$ID2")
fi

# ═══════════════════════════════════════════════════════════════
# Test 2: Parallel duplicate key → race-safe, same id
# ═══════════════════════════════════════════════════════════════
echo ""
info "Test 2: Parallel duplicate idempotency key (race condition)"

RACE_TMP=$(mktemp -d)
K2=$(uuid)
BODY_B="{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"${SLOT_B_DATE}T${SLOT_B_TIME}:00\",\"paymentMethod\":\"IN_PERSON\",\"idempotencyKey\":\"$K2\"}"

curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $K2" \
  -d "$BODY_B" > "$RACE_TMP/r1.json" &
PID1=$!

curl -s -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $K2" \
  -d "$BODY_B" > "$RACE_TMP/r2.json" &
PID2=$!

wait $PID1 $PID2 2>/dev/null

ID_R1=$(jq -r '.id // empty' "$RACE_TMP/r1.json" 2>/dev/null)
ID_R2=$(jq -r '.id // empty' "$RACE_TMP/r2.json" 2>/dev/null)

if [ -z "$ID_R1" ] || [ "$ID_R1" = "null" ] || [ -z "$ID_R2" ] || [ "$ID_R2" = "null" ]; then
  bad "Test 2 FAIL: one or both parallel requests failed"
  echo "   r1: $(head -c 250 "$RACE_TMP/r1.json")"
  echo "   r2: $(head -c 250 "$RACE_TMP/r2.json")"
  [ -n "$ID_R1" ] && [ "$ID_R1" != "null" ] && BOOKING_IDS+=("$ID_R1")
  [ -n "$ID_R2" ] && [ "$ID_R2" != "null" ] && BOOKING_IDS+=("$ID_R2")
elif [ "$ID_R1" = "$ID_R2" ]; then
  ok "Test 2 PASS: parallel requests converged to SAME id (${ID_R1:0:8}...)"
  BOOKING_IDS+=("$ID_R1")
else
  bad "Test 2 FAIL: parallel requests returned DIFFERENT ids (id1=$ID_R1 id2=$ID_R2)"
  BOOKING_IDS+=("$ID_R1" "$ID_R2")
fi
rm -rf "$RACE_TMP"

# ═══════════════════════════════════════════════════════════════
# Test 3: Different key on already-taken slot → 409
# ═══════════════════════════════════════════════════════════════
echo ""
info "Test 3: Different key on already-taken slot → 409 BOOKING_OVERLAP"

K3=$(uuid)
POST3=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/bookings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $K3" \
  -d "{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"${SLOT_A_DATE}T${SLOT_A_TIME}:00\",\"paymentMethod\":\"IN_PERSON\",\"idempotencyKey\":\"$K3\"}")

HTTP3=$(echo "$POST3" | tail -n1)
BODY3=$(echo "$POST3" | sed '$d')
CODE3=$(echo "$BODY3" | jq -r '.code // empty')

if [ "$HTTP3" = "409" ] && [ "$CODE3" = "BOOKING_OVERLAP" ]; then
  ok "Test 3 PASS: fresh key does NOT bypass overlap check (409 BOOKING_OVERLAP)"
else
  bad "Test 3 FAIL: expected 409 BOOKING_OVERLAP, got HTTP=$HTTP3 code=$CODE3"
  echo "   body: $(echo "$BODY3" | head -c 250)"
fi

# ═══════════════════════════════════════════════════════════════
# Test 4: Fresh key on free slot → success
# ═══════════════════════════════════════════════════════════════
echo ""
info "Test 4: Fresh key on different free slot → 201"

SLOT_C_DATE=""; SLOT_C_TIME=""
for i in $(seq 1 14); do
  DATE=$(date -u -d "+$i days" +%Y-%m-%d 2>/dev/null)
  [ -z "$DATE" ] && continue
  [ "$DATE" = "$SLOT_A_DATE" ] && continue
  [ "$DATE" = "$SLOT_B_DATE" ] && continue
  RESP=$(curl -s "$API_URL/businesses/$BUSINESS_SLUG/slots?serviceId=$SERVICE_ID&staffId=$STAFF_ID&date=$DATE")
  COUNT=$(echo "$RESP" | jq '.slots | length // 0')
  if [ "$COUNT" -ge 1 ]; then
    SLOT_C_DATE="$DATE"
    SLOT_C_TIME=$(echo "$RESP" | jq -r '.slots[0].startTime')
    break
  fi
done

if [ -z "$SLOT_C_TIME" ]; then
  info "Test 4 SKIP: no third free slot found in next 14 days"
else
  K4=$(uuid)
  POST4=$(curl -s -X POST "$API_URL/bookings" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $K4" \
    -d "{\"businessId\":\"$BIZ_ID\",\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startTime\":\"${SLOT_C_DATE}T${SLOT_C_TIME}:00\",\"paymentMethod\":\"IN_PERSON\",\"idempotencyKey\":\"$K4\"}")
  ID4=$(echo "$POST4" | jq -r '.id // empty')
  if [ -n "$ID4" ] && [ "$ID4" != "null" ]; then
    ok "Test 4 PASS: fresh key on free slot created ${ID4:0:8}..."
    BOOKING_IDS+=("$ID4")
  else
    bad "Test 4 FAIL: fresh key did not create booking. Body: $(echo "$POST4" | head -c 300)"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ All tests PASSED ($PASS/$PASS)"
  exit 0
else
  echo "❌ $FAIL failed, $PASS passed"
  exit 1
fi
