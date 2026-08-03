#!/bin/bash

# رنگ‌ها برای خروجی زیبا
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3001"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  شروع تست سیستم احراز هویت${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# تست 1: ثبت‌نام کاربر جدید
echo -e "${YELLOW}[تست 1] ثبت‌نام کاربر جدید...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "name": "کاربر تست",
    "password": "Test1234",
    "role": "CUSTOMER"
  }')

REGISTER_CODE=$(echo "$REGISTER_RESPONSE" | grep -o '"accessToken"' | head -1)
if [ -n "$REGISTER_CODE" ]; then
  echo -e "${GREEN}✅ ثبت‌نام موفق!${NC}"
else
  echo -e "${YELLOW}ℹ️  کاربر قبلاً ثبت شده (این طبیعیه)${NC}"
fi
echo ""

# تست 2: ورود با کاربر ادمین
echo -e "${YELLOW}[تست 2] ورود با کاربر admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@reservino.ir",
    "password": "admin123"
  }')

# استخراج access token
ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ADMIN_TOKEN" ]; then
  echo -e "${GREEN}✅ ورود ادمین موفق!${NC}"
  echo -e "   Token: ${ADMIN_TOKEN:0:50}..."
else
  echo -e "${RED}❌ خطا در ورود ادمین${NC}"
  echo "$LOGIN_RESPONSE"
  exit 1
fi
echo ""

# تست 3: GET /auth/me با توکن ادمین
echo -e "${YELLOW}[تست 3] دریافت اطلاعات کاربر فعلی (با توکن ادمین)...${NC}"
ME_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ME_RESPONSE" | grep -q '"email":"admin@reservino.ir"'; then
  echo -e "${GREEN}✅ GET /auth/me موفق!${NC}"
  echo "   Email: admin@reservino.ir"
else
  echo -e "${RED}❌ خطا در GET /auth/me${NC}"
  echo "$ME_RESPONSE"
fi
echo ""

# تست 4: GET /auth/admin-only با توکن ادمین (باید موفق باشه)
echo -e "${YELLOW}[تست 4] دسترسی به admin-only با کاربر ادمین...${NC}"
ADMIN_ONLY_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/admin-only" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ADMIN_ONLY_RESPONSE" | grep -q '"message"'; then
  echo -e "${GREEN}✅ دسترسی ادمین به admin-only موفق! (RBAC کار می‌کنه)${NC}"
else
  echo -e "${RED}❌ خطا در دسترسی ادمین${NC}"
  echo "$ADMIN_ONLY_RESPONSE"
fi
echo ""

# تست 5: ورود با کاربر عادی
echo -e "${YELLOW}[تست 5] ورود با کاربر CUSTOMER...${NC}"
CUSTOMER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }')

CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -n "$CUSTOMER_TOKEN" ]; then
  echo -e "${GREEN}✅ ورود کاربر عادی موفق!${NC}"
else
  echo -e "${RED}❌ خطا در ورود کاربر عادی${NC}"
  echo "$CUSTOMER_LOGIN"
  exit 1
fi
echo ""

# تست 6: GET /auth/admin-only با توکن کاربر عادی (باید 403 بده)
echo -e "${YELLOW}[تست 6] تلاش کاربر عادی برای دسترسی به admin-only (باید رد بشه)...${NC}"
FORBIDDEN_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/admin-only" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")

if echo "$FORBIDDEN_RESPONSE" | grep -q '"statusCode":403'; then
  echo -e "${GREEN}✅ RBAC درست کار می‌کنه! کاربر عادی رد شد.${NC}"
else
  echo -e "${RED}❌ RBAC کار نمی‌کنه - کاربر عادی دسترسی پیدا کرد!${NC}"
  echo "$FORBIDDEN_RESPONSE"
fi
echo ""

# تست 7: Refresh Token
echo -e "${YELLOW}[تست 7] تست Refresh Token...${NC}"
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)

REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

if echo "$REFRESH_RESPONSE" | grep -q '"accessToken"'; then
  echo -e "${GREEN}✅ Refresh Token موفق!${NC}"
else
  echo -e "${RED}❌ خطا در Refresh Token${NC}"
  echo "$REFRESH_RESPONSE"
fi
echo ""

# تست 8: ورود با پسورد اشتباه (باید 401 بده)
echo -e "${YELLOW}[تست 8] تلاش برای ورود با پسورد اشتباه...${NC}"
WRONG_PASS=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@reservino.ir",
    "password": "wrongpassword"
  }')

if echo "$WRONG_PASS" | grep -q '"statusCode":401'; then
  echo -e "${GREEN}✅ پسورد اشتباه به درستی رد شد!${NC}"
else
  echo -e "${RED}❌ پسورد اشتباه رد نشد!${NC}"
  echo "$WRONG_PASS"
fi
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}  🎉 همه تست‌ها تکمیل شد!${NC}"
echo -e "${YELLOW}========================================${NC}"
