#!/usr/bin/env bash

# DevPulse Production API Testing Script
# Test your backend endpoints after deployment

set -e

# Configuration
BACKEND_URL="${1:-http://localhost:3001}"
JWT_TOKEN="${2:-}"
API_URL="${BACKEND_URL%/}"

echo "🧪 DevPulse API Testing Suite"
echo "================================"
echo "Backend URL: $API_URL"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper function
test_endpoint() {
  local NAME="$1"
  local METHOD="$2"
  local ENDPOINT="$3"
  local DATA="$4"
  local EXPECTED_CODE="${5:-200}"
  
  echo -n "Testing $NAME... "
  
  local RESPONSE
  local HTTP_CODE
  
  if [ -n "$DATA" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$METHOD" \
      "$API_URL$ENDPOINT" \
      -H "Content-Type: application/json" \
      ${JWT_TOKEN:+-H "Authorization: Bearer $JWT_TOKEN"} \
      -d "$DATA")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$METHOD" \
      "$API_URL$ENDPOINT" \
      -H "Content-Type: application/json" \
      ${JWT_TOKEN:+-H "Authorization: Bearer $JWT_TOKEN"})
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  
  if [ "$HTTP_CODE" = "$EXPECTED_CODE" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $HTTP_CODE)"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC} (HTTP $HTTP_CODE, expected $EXPECTED_CODE)"
    echo "  Response: $BODY"
    ((FAILED++))
  fi
  
  echo ""
}

# Test 1: Health Check
test_endpoint "Health Check" "GET" "/health" "" "200"

# Test 2: Generate endpoint (with auth)
test_endpoint "Generate Briefing" "POST" "/api/generate" \
  '{"topic":"API Security"}' \
  "401"  # 401 because we don't have real JWT

# Test 3: CORS Preflight
echo -n "Testing CORS Preflight... "
CORS_RESPONSE=$(curl -s -i -X OPTIONS "$API_URL/api/generate" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST")

if echo "$CORS_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
  echo -e "${GREEN}✓ PASSED${NC}"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC}"
  ((FAILED++))
fi
echo ""

# Summary
echo "================================"
echo "Test Results:"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
else
  echo -e "${GREEN}Failed: 0${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
