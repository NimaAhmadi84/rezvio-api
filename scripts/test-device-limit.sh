#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Test: Device Limit (Phase 10D+) — سقف ۳ دستگاه فعال همزمان
# Self-cleaning. Usage:
#   TEST_EMAIL='...' TEST_PASSWORD='...' bash scripts/test-device-limit.sh
# ═══════════════════════════════════════════════════════════════
set -u
BASE_URL="${BASE_URL:-http://localhost:3001}"
EMAIL="${TEST_EMAIL:?TEST_EMAIL required}"
PASSWORD="${TEST_PASSWORD:?TEST_PASSWORD required}"

command -v jq >/dev/null || { echo "❌ jq نصب نیست"; exit 1; }
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "❌ $1"; }
field() { echo "$1" | jq -r "$2" 2>/dev/null; }

UA1="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 TestDevice1"
UA2="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1 TestDevice2"
UA3="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Firefox/121.0 TestDevice3"
UA4="Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 TestDevice4"

login() { # $1=UA [$2=sessionId] — با هدر، لاگین مجدد همان مرورگر = replace-in-place
  local HDR=()
  [ $# -ge 2 ] && [ -n "$2" ] && HDR=(-H "X-Current-Session-Id: $2")
  curl -s -X POST "$BASE_URL/auth/login-password" \
    -H 'Content-Type: application/json' "${HDR[@]}" -A "$1" \
    -d "{\"identifier\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"rememberMe\":false}"
}

echo "── پاکسازی اولیه: خروج از بقیه دستگاه‌ها (فعلی حفظ می‌شود) ──"
L1=$(login "$UA1")
T1=$(field "$L1" '.accessToken'); S1=$(field "$L1" '.sessionId')
if [ "$T1" = "null" ] || [ -z "$T1" ]; then
  bad "لاگین اولیه ناموفق (429؟ → ۶۰ثانیه صبر و دوباره)"; exit 1
fi
curl -s -X DELETE "$BASE_URL/auth/sessions" -H "Authorization: Bearer $T1" -H "X-Current-Session-Id: $S1" >/dev/null
ok "بیس‌لاین: ۱ سشن فعال (فعلی)"

echo "── ۱) دستگاه ۲ و ۳ → موفق ──"
L2=$(login "$UA2"); T2=$(field "$L2" '.accessToken'); S2=$(field "$L2" '.sessionId')
[ "$S2" != "null" ] && ok "دستگاه ۲ لاگین شد (۲/۳)" || bad "دستگاه ۲ رد شد!"
L3=$(login "$UA3")
[ "$(field "$L3" '.sessionId')" != "null" ] && ok "دستگاه ۳ لاگین شد (۳/۳)" || bad "دستگاه ۳ رد شد!"

echo "── ۲) لاگین مجدد دستگاه ۲ با هدر سشن → replace-in-place ──"
COUNT_BEFORE=$(curl -s "$BASE_URL/auth/sessions" -H "Authorization: Bearer $T2" | jq 'length')
L2B=$(login "$UA2" "$S2"); S2=$(field "$L2B" '.sessionId'); T2=$(field "$L2B" '.accessToken')
COUNT_AFTER=$(curl -s "$BASE_URL/auth/sessions" -H "Authorization: Bearer $T2" | jq 'length')
if [ "$COUNT_BEFORE" = "3" ] && [ "$COUNT_AFTER" = "3" ]; then ok "replace-in-place: تعداد ۳ ماند"; else bad "تعداد تغییر کرد ($COUNT_BEFORE → $COUNT_AFTER)"; fi

echo "── ۳) دستگاه ۴ → 409 با pendingToken ──"
L4=$(login "$UA4")
CODE4=$(field "$L4" '.code'); PT=$(field "$L4" '.pendingToken')
NSESSIONS=$(field "$L4" '.activeSessions | length')
if [ "$CODE4" = "DEVICE_LIMIT_REACHED" ] && [ "$PT" != "null" ] && [ "$NSESSIONS" = "3" ]; then
  ok "409 + DEVICE_LIMIT_REACHED + pendingToken + ۳ دستگاه"
else bad "409 ناقص: code=$CODE4 sessions=$NSESSIONS"; echo "$L4" | head -c 300; echo; fi

echo "── ۴) sessions/pending → لیست دستگاه‌ها ──"
PENDING=$(curl -s -X POST "$BASE_URL/auth/sessions/pending" -H 'Content-Type: application/json' -A "$UA4" -d "{\"pendingToken\":\"$PT\"}")
[ "$(field "$PENDING" 'length')" = "3" ] && ok "لیست ۳ دستگاه برگشت" || { bad "pending شکست"; echo "$PENDING" | head -c 200; }

echo "── ۵) complete: خروج از قدیمی‌ترین دستگاه + لاگین بدون رمز ──"
REVOKE_ID=$(field "$PENDING" '.[-1].id')  # ← قدیمی‌ترین (آخر لیست)
if [ "$REVOKE_ID" = "null" ] || [ -z "$REVOKE_ID" ]; then bad "REVOKE_ID استخراج نشد"; exit 1; fi
COMP=$(curl -s -X POST "$BASE_URL/auth/sessions/complete" -H 'Content-Type: application/json' -A "$UA4" \
  -d "{\"pendingToken\":\"$PT\",\"revokeSessionId\":\"$REVOKE_ID\"}")
T4=$(field "$COMP" '.accessToken'); S4=$(field "$COMP" '.sessionId'); RT4=$(field "$COMP" '.refreshToken')
if [ -n "$T4" ] && [ "$T4" != "null" ] && [ "$S4" != "null" ]; then ok "لاگین تکمیل شد (دستگاه ۴ فعال)"; else bad "complete شکست"; echo "$COMP" | head -c 300; fi

echo "── ۶) pendingToken تک‌مصرف → استفاده مجدد 401 ──"
REUSE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/auth/sessions/pending" -H 'Content-Type: application/json' -A "$UA4" -d "{\"pendingToken\":\"$PT\"}")
[ "$REUSE" = "401" ] && ok "single-use ✅" || bad "توکن دوباره قبول شد! ($REUSE)"

echo "── ۷) logout سروری → refresh همان سشن 401 ──"
curl -s -X POST "$BASE_URL/auth/logout" -H "Authorization: Bearer $T4" -H "X-Current-Session-Id: $S4" >/dev/null
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/auth/refresh" \
  -H 'Content-Type: application/json' -H "X-Current-Session-Id: $S4" -d "{\"refreshToken\":\"$RT4\"}")
[ "$RC" = "401" ] && ok "revoke واقعی روی refresh ✅" || bad "refresh پاس شد! ($RC)"

echo "── پاکسازی نهایی ──"
L9=$(login "$UA1"); T9=$(field "$L9" '.accessToken')
[ "$T9" != "null" ] && curl -s -X DELETE "$BASE_URL/auth/sessions" -H "Authorization: Bearer $T9" >/dev/null
ok "همه سشن‌های تست revoke شدند"

echo "════════════════════════════════"
echo "نتیجه: ✅ $PASS  |  ❌ $FAIL"
[ $FAIL -eq 0 ] && exit 0 || exit 1
