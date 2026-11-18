#!/usr/bin/env bash
# ==============================================================================
# scripts/test-input-security.sh
# Automated Security Test Suite for Input Sanitization & File Upload Sandboxing
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
EVIDENCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/evidence/feature-input-security"
mkdir -p "$EVIDENCE_DIR"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
EVIDENCE_FILE="$EVIDENCE_DIR/test-run-$(date +"%Y%m%d_%H%M%S").log"

exec > >(tee -a "$EVIDENCE_FILE") 2>&1

echo "=============================================================================="
echo " INPUT SANITIZATION & FILE-UPLOAD SANDBOXING TEST SUITE"
echo " Timestamp : $TIMESTAMP"
echo " Target URL: $BASE_URL"
echo " Log file  : $EVIDENCE_FILE"
echo "=============================================================================="
echo ""

# Temporary scratch space for files
TMP_DIR="$(mktemp -d /tmp/sec_test_XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Create Test Files
# 1. Real valid PDF (%PDF- header)
REAL_PDF="$TMP_DIR/valid_report.pdf"
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n164\n%%%%EOF\n' > "$REAL_PDF"

# 2. Fake PDF with DOS/PE MZ header bytes (Disguised .exe)
FAKE_PDF="$TMP_DIR/disguised_malware.pdf"
printf 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00' > "$FAKE_PDF"

# 3. Oversized file (> 10 MB, exactly 11 MB)
OVERSIZED_PDF="$TMP_DIR/oversized_record.pdf"
head -c $(( 11 * 1024 * 1024 )) /dev/zero > "$OVERSIZED_PDF"
# Prepend PDF header so it is structurally PDF but oversized
printf '%%PDF-1.4\n' | dd of="$OVERSIZED_PDF" conv=notrunc 2>/dev/null || true

# Test Counter
PASSED=0
FAILED=0
TOTAL=0

printf "%-4s | %-28s | %-10s | %-6s | %-6s | %-6s\n" "ID" "Test Case" "Target" "Expect" "Got" "Status"
printf "%s\n" "-----+------------------------------+------------+--------+--------+-------"

run_text_test() {
  local id="$1"
  local desc="$2"
  local payload="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))

  local response_file="$TMP_DIR/resp_$id.json"
  local http_code
  http_code=$(curl -s -o "$response_file" -w "%{http_code}" \
    -X POST "$BASE_URL/api/security-test/text" \
    -H "Content-Type: application/json" \
    -d "$payload" || echo "000")

  local status="FAIL"
  if [ "$http_code" -eq "$expected" ]; then
    status="PASS"
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi

  printf "%-4s | %-28s | %-10s | %-6s | %-6s | %-6s\n" "$id" "$desc" "POST /text" "$expected" "$http_code" "$status"
}

run_file_test() {
  local id="$1"
  local desc="$2"
  local file_path="$3"
  local mime_type="$4"
  local expected="$5"
  TOTAL=$((TOTAL + 1))

  local response_file="$TMP_DIR/resp_$id.json"
  local http_code
  http_code=$(curl -s -o "$response_file" -w "%{http_code}" \
    -X POST "$BASE_URL/api/security-test/upload" \
    -F "file=@$file_path;type=$mime_type" || echo "000")

  local status="FAIL"
  if [ "$http_code" -eq "$expected" ]; then
    status="PASS"
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi

  printf "%-4s | %-28s | %-10s | %-6s | %-6s | %-6s\n" "$id" "$desc" "POST /upload" "$expected" "$http_code" "$status"
}

# Run the 9 Test Scenarios
run_text_test "T1" "XSS script tag" '{"input": "<script>alert(1)</script>"}' 400
run_text_test "T2" "Event handler attribute" '{"input": "<img src=x onerror=alert(1)>"}' 400
run_text_test "T3" "SQL injection string" "{\"input\": \"' OR 1=1 --\"}" 400
run_text_test "T4" "NoSQL operator key" '{"$ne": null}' 400
run_text_test "T5" "Path traversal (../)" '{"input": "../../etc/passwd"}' 400
run_file_test "T6" "Real .pdf file" "$REAL_PDF" "application/pdf" 200
run_file_test "T7" "Fake .pdf (MZ header)" "$FAKE_PDF" "application/pdf" 415
run_file_test "T8" "Oversized file (>10MB)" "$OVERSIZED_PDF" "application/pdf" 413
run_text_test "T9" "Safe clinical input" '{"input": "Patient John Doe, Normal Glucose: 95 mg/dL"}' 200

echo ""
echo "=============================================================================="
echo " TEST SUMMARY: Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"
echo "=============================================================================="

if [ "$FAILED" -eq 0 ]; then
  echo ">>> ALL SECURITY VERIFICATION TESTS PASSED SUCCESSFULLY! <<<"
  exit 0
else
  echo ">>> SOME SECURITY VERIFICATION TESTS FAILED! <<<"
  exit 1
fi
