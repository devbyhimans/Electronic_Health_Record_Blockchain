#!/usr/bin/env bash
# Start the existing Fabric network and application services without resetting
# crypto material, channel data, chaincode, or Docker volumes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"
FABRIC_COMPOSE="${FABRIC_DIR}/docker/docker-compose-network.yaml"
CA_COMPOSE="${FABRIC_DIR}/docker/docker-compose-ca.yaml"
APP_COMPOSE="${ROOT_DIR}/docker-compose.yaml"
export COMPOSE_IGNORE_ORPHANS=true

# ANSI styling
BOLD="\033[1m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
BLUE="\033[1;34m"
MAGENTA="\033[1;35m"
RED="\033[1;31m"
GRAY="\033[0;90m"
RESET="\033[0m"

echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}            EHR BLOCKCHAIN NETWORK & APPLICATION LAUNCHER                     ${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"

# Check for --build or -b flag
BUILD_FLAG=""
for arg in "$@"; do
  if [[ "$arg" == "--build" || "$arg" == "-b" ]]; then
    BUILD_FLAG="--build"
  fi
done

if [[ -n "$BUILD_FLAG" ]]; then
  echo -e "  ${YELLOW}ℹ Build flag active: Rebuilding modified container images...${RESET}\n"
else
  echo -e "  ${GRAY}ℹ Fast startup active. (Pass --build to rebuild Docker images)${RESET}\n"
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}Docker Engine and the Docker Compose plugin are required.${RESET}" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}Docker is not accessible. Start Docker and ensure your account can run 'docker ps'.${RESET}" >&2
  exit 1
fi
if [[ ! -f "${FABRIC_COMPOSE}" || ! -f "${CA_COMPOSE}" || ! -f "${APP_COMPOSE}" ]]; then
  echo -e "${RED}Required Fabric or application Compose file is missing.${RESET}" >&2
  exit 1
fi

for identity_dir in \
  "${FABRIC_DIR}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp" \
  "${FABRIC_DIR}/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/msp"; do
  if [[ ! -d "${identity_dir}" ]]; then
    echo -e "${RED}Existing Fabric identity material was not found at: ${identity_dir}${RESET}" >&2
    echo "This startup script will not enroll identities or initialize a network." >&2
    echo "Use the team's first-time Fabric setup procedure, then run ./start.sh again." >&2
    exit 1
  fi
done

for ca_state in \
  "${FABRIC_DIR}/organizations/ordererOrganizations/example.com/ca" \
  "${FABRIC_DIR}/organizations/peerOrganizations/hospital.example.com/ca" \
  "${FABRIC_DIR}/organizations/peerOrganizations/diagnostic.example.com/ca" \
  "${FABRIC_DIR}/organizations/peerOrganizations/provider.example.com/ca"; do
  if [[ ! -s "${ca_state}/ca-cert.pem" || ! -s "${ca_state}/fabric-ca-server.db" ]]; then
    echo -e "${RED}Existing Fabric CA state was not found at: ${ca_state}${RESET}" >&2
    echo "This startup script will not initialize or replace a certificate authority." >&2
    exit 1
  fi
done

if ! docker network inspect ehr_network >/dev/null 2>&1; then
  echo -e "  ${YELLOW}Creating the shared Docker network ehr_network...${RESET}"
  docker network create ehr_network >/dev/null
fi

echo -e "${BOLD}${BLUE}[1/6] 🔐 Starting Fabric certificate authorities...${RESET}"
docker compose -f "${CA_COMPOSE}" up -d
echo -e "  ${GREEN}✓ Fabric CAs online (Orderer, Hospital, Diagnostic, Provider)${RESET}"

echo -e "\n${BOLD}${BLUE}[2/6] ⛓️  Starting Fabric peers and orderer (ehrchannel)...${RESET}"
docker compose -f "${FABRIC_COMPOSE}" up -d
echo -e "  ${GREEN}✓ Fabric ledger nodes online on ehrchannel${RESET}"

echo -e "\n${BOLD}${BLUE}[3/6] 🏥 Starting hospital, patient, lab, and IPFS services...${RESET}"
docker compose -f "${APP_COMPOSE}" up -d ${BUILD_FLAG} \
  h-ipfs-service h-peer0-api h-peer1-api h-peer2-api h-extorg-api h-patient-api \
  h-hospital-portal h-patient-portal l-node-gateway
echo -e "  ${GREEN}✓ Core hospital backends, IPFS, and web portals initialized${RESET}"

if [[ -f "${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/.env" ]]; then
  echo -e "\n${BOLD}${BLUE}[4/6] 📊 Starting the realtime blockchain dashboard...${RESET}"
  docker compose -f "${APP_COMPOSE}" --profile dashboard up -d ${BUILD_FLAG} h-dashboard-api h-dashboard-portal
  echo -e "  ${GREEN}✓ Dashboard API & Realtime Portal active${RESET}"
else
  echo -e "\n${BOLD}${BLUE}[4/6] 📊 Realtime dashboard skipped (configure dashboard-api/.env to enable)${RESET}"
fi

echo -e "\n${BOLD}${BLUE}[5/6] 💊 Starting the six pharmacy services and portals...${RESET}"
docker compose -f "${APP_COMPOSE}" up -d ${BUILD_FLAG} \
  p-backend p-manager p-employee p-inventory p-billing p-frontend p-patient
echo -e "  ${GREEN}✓ Pharmacy backend API and portals started${RESET}"

echo -e "\n${BOLD}${BLUE}[6/6] 🌐 Refreshing Nginx Gateway and verifying mesh health...${RESET}"
docker compose -f "${APP_COMPOSE}" up -d nginx
docker compose -f "${APP_COMPOSE}" restart nginx >/dev/null 2>&1
echo -e "  ${GREEN}✓ Nginx gateway routed to all active services${RESET}\n"

declare -A DESCRIPTIONS=(
  ["nginx"]="Reverse Proxy & Entry Hub"
  ["h-hospital-portal"]="Hospital Web Portal"
  ["h-patient-portal"]="Patient Web Portal"
  ["h-dashboard-portal"]="Realtime Dashboard Portal"
  ["h-peer0-api"]="Reception / Admin API"
  ["h-peer1-api"]="Doctor API"
  ["h-peer2-api"]="Nurse / Pharmacy API"
  ["h-extorg-api"]="Lab / Claims API"
  ["h-patient-api"]="Patient Records API"
  ["h-ipfs-service"]="IPFS Storage Service"
  ["h-dashboard-api"]="Dashboard Realtime API"
  ["l-node-gateway"]="Lab Node Gateway"
  ["p-frontend"]="Pharmacy Main Portal"
  ["p-manager"]="Pharmacy Manager Portal"
  ["p-employee"]="Pharmacy Employee Portal"
  ["p-inventory"]="Pharmacy Inventory Portal"
  ["p-patient"]="Pharmacy Patient Portal"
  ["p-billing"]="Pharmacy Billing Portal"
  ["p-backend"]="Pharmacy Backend API"
)

printf "  ${BOLD}%-24s %-10s %-8s %s${RESET}\n" "SERVICE" "STATUS" "PORT" "DESCRIPTION"
printf "  ${GRAY}%-24s %-10s %-8s %s${RESET}\n" "────────────────────────" "──────────" "────────" "──────────────────────────────"

while IFS="|" read -r svc status ports; do
  [[ -z "$svc" ]] && continue
  port_str="-"
  if [[ "$ports" =~ :([0-9]+)-\> ]]; then
    port_str=":${BASH_REMATCH[1]}"
  fi
  desc="${DESCRIPTIONS[$svc]:-Microservice}"
  if [[ "$status" =~ ^Up ]]; then
    status_fmt="${GREEN}✔ UP${RESET}"
  else
    status_fmt="${RED}✖ DOWN${RESET}"
  fi
  printf "  %-24s %-19b %-8s %s\n" "$svc" "$status_fmt" "$port_str" "$desc"
done < <(docker compose -f "${APP_COMPOSE}" --profile dashboard ps --format "{{.Service}}|{{.Status}}|{{.Ports}}")

echo -e "\n${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}                     EHR SYSTEM IS LIVE AND ACCESSIBLE                        ${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e ""
echo -e "  ${BOLD}${MAGENTA}🌐 Web Applications & Portals (Open in Browser):${RESET}"
echo -e "     • System Dashboard      : ${BOLD}${GREEN}http://localhost/dashboard/${RESET} ${GRAY}(direct port :5176)${RESET}"
echo -e "     • Unified Entry Hub     : ${BOLD}${GREEN}http://localhost/${RESET}"
echo -e "     • Hospital Web Portal   : ${BOLD}${GREEN}http://localhost:5173/${RESET}"
echo -e "     • Patient Web Portal    : ${BOLD}${GREEN}http://localhost:5174/${RESET}"
echo -e "     • Pharmacy Main Portal  : ${BOLD}${GREEN}http://localhost:5175/${RESET}"
echo -e "     • Pharmacy Sub-Portals  : ${GRAY}Manager:   http://localhost:3001/${RESET}"
echo -e "                               ${GRAY}Employee:  http://localhost:3002/${RESET}"
echo -e "                               ${GRAY}Inventory: http://localhost:3003/${RESET}"
echo -e "                               ${GRAY}Patient:   http://localhost:3004/${RESET}"
echo -e "                               ${GRAY}Billing:   http://localhost:3005/${RESET}"
echo -e "     • Lab Service & Portal  : ${BOLD}${GREEN}http://localhost/lab/${RESET} ${GRAY}(gateway :3006)${RESET}"
echo -e "     • IPFS Web Gateway      : ${BOLD}${GREEN}http://localhost:8090/ipfs/<CID>${RESET}"
echo -e "     • IPFS Node API         : ${BOLD}${GREEN}http://localhost:5001/${RESET}"
echo -e ""
echo -e "  ${BOLD}${MAGENTA}⚙️ Headless Backend APIs (REST Health Endpoints — Not Web Pages):${RESET}"
echo -e "     • Reception / Admin API : ${BOLD}http://localhost:4001/health${RESET}"
echo -e "     • Doctor API            : ${BOLD}http://localhost:4002/health${RESET}"
echo -e "     • Nurse / Pharmacy API  : ${BOLD}http://localhost:4003/health${RESET}"
echo -e "     • Lab / Claims API      : ${BOLD}http://localhost:4004/health${RESET}"
echo -e "     • Patient API           : ${BOLD}http://localhost:4005/health${RESET}"
echo -e "     • IPFS Storage Service  : ${BOLD}http://localhost:4006/health${RESET}"
echo -e "     • Dashboard Stream API  : ${BOLD}http://localhost:4010/health${RESET}"
echo -e "     • Pharmacy Backend API  : ${BOLD}http://localhost:3000/health${RESET}"
echo -e ""
echo -e "  ${BOLD}${MAGENTA}🔐 Default Login Credentials:${RESET}"
echo -e "     • Receptionist          : ${YELLOW}receptionist${RESET}   / ${YELLOW}password123${RESET}"
echo -e "     • Doctor                : ${YELLOW}doctor${RESET}         / ${YELLOW}password123${RESET}"
echo -e "     • Pharmacist            : ${YELLOW}pharmacist${RESET}     / ${YELLOW}password123${RESET}"
echo -e "     • Hospital Admin        : ${YELLOW}hospitaladmin${RESET}  / ${YELLOW}password123${RESET}"
echo -e "     • Patient               : ${YELLOW}testuser${RESET}       / ${YELLOW}password123${RESET}"
echo -e "     • Lab Technician        : ${YELLOW}labtech${RESET}        / ${YELLOW}password123${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}\n"
