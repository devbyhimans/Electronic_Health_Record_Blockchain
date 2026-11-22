#!/usr/bin/env bash
# start.sh — bring the whole EHR system up.
#
# Safe to run on a fresh clone and on an existing installation:
#   • no Fabric identities yet  → creates the network (CAs, enrolment, peers,
#                                 orderer, channel, anchor peers)
#   • identities already exist  → starts the existing network, keeps all data
#   • chaincode missing/changed → deploys or upgrades `ehr` automatically
#   • then starts every application service, the dashboard and nginx,
#     and waits for each health endpoint.
#
# Usage:  ./start.sh [--build] [--no-dashboard] [--skip-chaincode]
# Target: Ubuntu 22.04/24.04 (also runs under WSL2 with Docker Desktop).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"
FABRIC_COMPOSE="${FABRIC_DIR}/docker/docker-compose-network.yaml"
CA_COMPOSE="${FABRIC_DIR}/docker/docker-compose-ca.yaml"
APP_COMPOSE="${ROOT_DIR}/docker-compose.yaml"
ORGS_DIR="${FABRIC_DIR}/organizations"
export COMPOSE_IGNORE_ORPHANS=true
export PATH="${ROOT_DIR}/bin:${PATH}"

BOLD="\033[1m"; CYAN="\033[1;36m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"
BLUE="\033[1;34m"; RED="\033[1;31m"; GRAY="\033[0;90m"; RESET="\033[0m"

step() { echo -e "\n${BOLD}${BLUE}[$1] $2${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $1${RESET}"; }
note() { echo -e "  ${GRAY}$1${RESET}"; }
die()  { echo -e "${RED}✖ $1${RESET}" >&2; exit 1; }

BUILD_FLAG=""; WITH_DASHBOARD=true; SKIP_CHAINCODE=false
for arg in "$@"; do
  case "$arg" in
    --build|-b)       BUILD_FLAG="--build" ;;
    --no-dashboard)   WITH_DASHBOARD=false ;;
    --skip-chaincode) SKIP_CHAINCODE=true ;;
    --help|-h)        sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $arg (try --help)" ;;
  esac
done

echo -e "${CYAN}══════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}        EHR BLOCKCHAIN — NETWORK & APPLICATION LAUNCHER${RESET}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════${RESET}"

# ── Prerequisites ────────────────────────────────────────────────────────────
for tool in docker node curl jq; do
  command -v "$tool" >/dev/null 2>&1 || die "Missing prerequisite: $tool (run ./setup.sh for details)"
done
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is required."
docker info >/dev/null 2>&1 || die "Docker is not accessible. Start Docker and make sure your user can run 'docker ps'."
for f in "${FABRIC_COMPOSE}" "${CA_COMPOSE}" "${APP_COMPOSE}"; do
  [[ -f "$f" ]] || die "Missing compose file: $f"
done

# Root .env carries the shared secrets docker-compose.yaml requires.
node "${ROOT_DIR}/scripts/init-env.js" || die "Could not prepare ${ROOT_DIR}/.env"

docker network inspect ehr_network >/dev/null 2>&1 || docker network create ehr_network >/dev/null

# ── 1. Fabric network ────────────────────────────────────────────────────────
PEER_MSP="${ORGS_DIR}/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/msp"
ORDERER_MSP="${ORGS_DIR}/ordererOrganizations/example.com/orderers/orderer.example.com/msp"

# Prints "yes" when peer0.hospital has joined the specified channel, "no" when it answers
# but has not, and fails when the peer never answers.
peer_on_channel() {
  local target_channel="${1:-ehrchannel}"
  local out attempt
  for attempt in $(seq 1 20); do
    if out="$(FABRIC_CFG_PATH="${FABRIC_DIR}/configtx" CORE_PEER_TLS_ENABLED=true \
        CORE_PEER_LOCALMSPID=HospitalMSP CORE_PEER_ADDRESS=localhost:7051 \
        CORE_PEER_TLS_ROOTCERT_FILE="${ORGS_DIR}/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt" \
        CORE_PEER_MSPCONFIGPATH="${ORGS_DIR}/peerOrganizations/hospital.example.com/users/hospitaladmin/msp" \
        peer channel list 2>&1)"; then
      if echo "${out}" | grep -qx "${target_channel}"; then echo yes; else echo no; fi
      return 0
    fi
    sleep 3
  done
  echo "${out}" >&2
  return 1
}

build_network() {
  ( cd "${FABRIC_DIR}" && bash scripts/network-up.sh )
}

if [[ -d "${PEER_MSP}" && -d "${ORDERER_MSP}" ]]; then
  step "1/5" "Starting the existing Fabric network (data preserved)"
  docker compose -f "${CA_COMPOSE}" up -d
  docker compose -f "${FABRIC_COMPOSE}" up -d
  ok "CAs, orderer, 5 peers and IPFS node started"

  JOINED="$(peer_on_channel ehrchannel)" || die "peer0.hospital is not answering. Check: docker logs docker-peer0.hospital.example.com-1 --tail 50"
  if [[ "${JOINED}" == "no" ]]; then
    # Identity files exist but this machine has no ledger for them (for example
    # the folder was copied from another computer, or Docker volumes were removed).
    # There is no channel data to preserve, so rebuild the network cleanly.
    echo -e "  ${YELLOW}Peers are running but ehrchannel does not exist on this machine.${RESET}"
    echo -e "  ${YELLOW}Rebuilding the Fabric network from scratch (old identity files are replaced).${RESET}"
    bash "${ROOT_DIR}/scripts/reset-app-state.sh"
    ( cd "${FABRIC_DIR}" && bash scripts/network-down.sh )
    rm -rf "${FABRIC_DIR}/.generated"
    docker network inspect ehr_network >/dev/null 2>&1 || docker network create ehr_network >/dev/null
    build_network
    ok "Fabric network rebuilt"
  else
    # Check if insurancechannel exists on existing network; create and join peers if missing
    JOINED_INS="$(peer_on_channel insurancechannel 2>/dev/null || echo no)"
    if [[ "${JOINED_INS}" == "no" ]]; then
      echo -e "  ${CYAN}Creating dedicated insurancechannel on existing network...${RESET}"
      ( cd "${FABRIC_DIR}" && bash scripts/createChannel.sh --channel insurancechannel --orgs "1,3,4,5" )
      ok "insurancechannel created and peers joined"
    fi
  fi
else
  step "1/5" "No Fabric identities found — creating the network from scratch"
  note "This enrols every identity, starts peers/orderer, creates ehrchannel + insurancechannel and sets anchor peers."
  bash "${ROOT_DIR}/scripts/reset-app-state.sh"
  docker network inspect ehr_network >/dev/null 2>&1 || docker network create ehr_network >/dev/null
  build_network
  ok "Fabric network created"
fi

# ── 2. Chaincode ─────────────────────────────────────────────────────────────
if [[ "${SKIP_CHAINCODE}" == true ]]; then
  step "2/5" "Chaincode check skipped (--skip-chaincode)"
else
  step "2/5" "Checking the ehr chaincode on channels"
  bash "${FABRIC_DIR}/scripts/ensure-chaincode.sh" --channel ehrchannel --name ehr
  bash "${FABRIC_DIR}/scripts/ensure-chaincode.sh" --channel insurancechannel --name ehr
  ok "Chaincode is current across ehrchannel and insurancechannel"
fi

# ── 3. Application services ──────────────────────────────────────────────────
step "3/5" "Starting backends, AI agent, lab, pharmacy and portals"
docker compose -f "${APP_COMPOSE}" up -d ${BUILD_FLAG} \
  h-ipfs-service h-peer0-api h-peer1-api h-peer2-api h-extorg-api h-patient-api \
  h-digilocker-service clinical-ai-agent l-node-gateway p-backend \
  h-hospital-portal h-patient-portal p-frontend
ok "Application containers started"

# ── 4. Dashboard ─────────────────────────────────────────────────────────────
if [[ "${WITH_DASHBOARD}" == true ]]; then
  step "4/5" "Starting the realtime dashboard"
  bash "${ROOT_DIR}/scripts/setup-dashboard-identity.sh" \
    || echo -e "  ${YELLOW}Dashboard observer identity could not be prepared; the dashboard will show no blockchain data.${RESET}"
  docker compose -f "${APP_COMPOSE}" --profile dashboard up -d ${BUILD_FLAG} h-dashboard-api h-dashboard-portal
  ok "Dashboard API and portal started"
else
  step "4/5" "Dashboard skipped (--no-dashboard)"
fi

# ── 5. Gateway + health ──────────────────────────────────────────────────────
step "5/5" "Starting nginx and waiting for services to become healthy"
docker compose -f "${APP_COMPOSE}" up -d nginx
docker compose -f "${APP_COMPOSE}" restart nginx >/dev/null 2>&1 || true

# name|url — first start installs npm packages inside each container, which can
# take several minutes on a slow machine or under WSL2.
CHECKS=(
  "IPFS service|http://localhost:4006/health"
  "Reception/Admin API|http://localhost:4001/health"
  "Doctor API|http://localhost:4002/health"
  "Nurse/Pharmacist API|http://localhost:4003/health"
  "Lab/Claims API|http://localhost:4004/health"
  "Insurance & TPA Claims Deck|http://localhost:4004/insurance/"
  "Patient API|http://localhost:4005/health"
  "DigiLocker service|http://localhost:4007/health"
  "Clinical AI agent|http://localhost:8000/health"
  "Lab gateway|http://localhost:3006/api/health"
  "Pharmacy backend|http://localhost:3000/health"
  "Hospital portal|http://localhost:5173/"
  "Patient portal|http://localhost:5174/"
  "Pharmacy suite|http://localhost:5175/"
  "Hub (nginx)|http://localhost/"
)
if [[ "${WITH_DASHBOARD}" == true ]]; then
  CHECKS+=("Dashboard API|http://localhost:4010/health" "Dashboard portal|http://localhost:5176/dashboard/")
fi

WAIT_SECONDS="${EHR_START_TIMEOUT:-600}"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
declare -A UP=()
while :; do
  pending=0
  for entry in "${CHECKS[@]}"; do
    name="${entry%%|*}"; url="${entry#*|}"
    [[ -n "${UP[$name]:-}" ]] && continue
    if curl -fsS -m 4 -o /dev/null "$url" 2>/dev/null; then
      UP[$name]=1; ok "${name}"
    else
      pending=$((pending + 1))
    fi
  done
  (( pending == 0 )) && break
  (( $(date +%s) >= deadline )) && break
  sleep 5
done

FAILED=0
for entry in "${CHECKS[@]}"; do
  name="${entry%%|*}"; url="${entry#*|}"
  if [[ -z "${UP[$name]:-}" ]]; then
    echo -e "  ${RED}✖ ${name} did not answer at ${url}${RESET}"
    FAILED=$((FAILED + 1))
  fi
done

echo -e "\n${CYAN}══════════════════════════════════════════════════════════════════${RESET}"
if (( FAILED > 0 )); then
  echo -e "${YELLOW}${BOLD}  ${FAILED} service(s) are not healthy after ${WAIT_SECONDS}s.${RESET}"
  echo -e "  Inspect with:  docker compose --profile dashboard ps"
  echo -e "                 docker compose logs <service> --tail 80"
else
  echo -e "${GREEN}${BOLD}  All services are healthy.${RESET}"
fi
echo -e "
  Hub                 http://localhost/
  Hospital & Lab      http://localhost:5173/
  Patient portal      http://localhost:5174/
  Pharmacy suite      http://localhost:5175/
  Lab control deck    http://localhost/lab/
  Insurance & Claims  http://localhost/insurance/
  Dashboard           http://localhost/dashboard/
  IPFS gateway        http://localhost:8090/ipfs/<CID>

  Demo accounts are shown on each portal's login page.
  Stop with ./stop.sh   ·   wipe everything with ./stop.sh --reset"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════${RESET}\n"
(( FAILED == 0 ))
