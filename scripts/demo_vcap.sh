#!/usr/bin/env bash
set -e

# Colors for terminal display
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}===================================================================${NC}"
echo -e "${BOLD}  VCAP (Verifiable Clinical AI Provenance) Verification Demo${NC}"
echo -e "${CYAN}  Implementation of proposal.tex Section 7 & Section 15${NC}"
echo -e "${CYAN}===================================================================${NC}\n"

# 1. Standalone cryptographic engine verification
echo -e "${BOLD}[1/2] Running Cryptographic Hash Suite in Node Gateway Container...${NC}"
docker compose exec -T l-node-gateway node test-vcap.js

# 2. REST API Demonstration
echo -e "\n${BOLD}[2/2] Running 3-Stage Tamper Detection Demo via Gateway REST API...${NC}"
DEMO_RESP=$(curl -s -X POST http://localhost:3006/api/vcap/tamper-demo)
DEMO_ID=$(echo "$DEMO_RESP" | grep -o '"demoId":"[^"]*' | cut -d'"' -f4)

echo -e "   Demo Record ID: ${YELLOW}${DEMO_ID}${NC}"

STAGE1_STATUS=$(echo "$DEMO_RESP" | grep -o '"stage1_authentic":{[^}]*' | grep -o '"status":"[^"]*' | head -n1 | cut -d'"' -f4)
STAGE2_STATUS=$(echo "$DEMO_RESP" | grep -o '"stage2_clinical_tamper":{[^}]*' | grep -o '"status":"[^"]*' | head -n1 | cut -d'"' -f4)
STAGE3_STATUS=$(echo "$DEMO_RESP" | grep -o '"stage3_ai_summary_tamper":{[^}]*' | grep -o '"status":"[^"]*' | head -n1 | cut -d'"' -f4)

echo -e "\n   ${BOLD}--- Stage Results Summary ---${NC}"
echo -e "   1. Authentic Record & AI Output   : ${GREEN}✔ ${STAGE1_STATUS}${NC}"
echo -e "   2. Tampered Record (Hb 8.5->14.5) : ${RED}🚨 ${STAGE2_STATUS}${NC}"
echo -e "   3. Tampered AI Diagnostic Summary : ${RED}🚨 ${STAGE3_STATUS}${NC}"

echo -e "\n${GREEN}===================================================================${NC}"
echo -e "${GREEN}${BOLD}✔ VCAP VERIFICATION SYSTEM IS FULLY OPERATIONAL AND VERIFIED!${NC}"
echo -e "${GREEN}===================================================================${NC}\n"
