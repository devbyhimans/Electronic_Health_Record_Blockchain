#!/usr/bin/env bash
# Stop services while preserving Fabric identities, ledger data, and volumes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"
FABRIC_COMPOSE="${FABRIC_DIR}/docker/docker-compose-network.yaml"
CA_COMPOSE="${FABRIC_DIR}/docker/docker-compose-ca.yaml"
APP_COMPOSE="${ROOT_DIR}/docker-compose.yaml"

# ANSI styling
BOLD="\033[1m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
GRAY="\033[0;90m"
RESET="\033[0m"

echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}               STOPPING EHR BLOCKCHAIN SERVICES & NETWORK                     ${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"

echo -e "\n  ${YELLOW}[1/3] Stopping application containers (portals, APIs, microservices)...${RESET}"
docker compose -f "${APP_COMPOSE}" --profile dashboard stop >/dev/null 2>&1 || true
echo -e "  ${GREEN}✓ Application containers stopped (Docker volumes preserved)${RESET}"

echo -e "\n  ${YELLOW}[2/3] Stopping Fabric peers, orderer, and IPFS node...${RESET}"
docker compose -f "${FABRIC_COMPOSE}" stop >/dev/null 2>&1 || true
echo -e "  ${GREEN}✓ Fabric network nodes stopped (ledger data preserved)${RESET}"

echo -e "\n  ${YELLOW}[3/3] Stopping Fabric certificate authorities...${RESET}"
docker compose -f "${CA_COMPOSE}" stop >/dev/null 2>&1 || true
echo -e "  ${GREEN}✓ Fabric CAs stopped (identity certificates preserved)${RESET}"

echo -e "\n${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✓ All EHR services stopped successfully.${RESET}"
echo -e "  ${GRAY}Run ./start.sh anytime to bring the entire stack back online.${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}\n"

