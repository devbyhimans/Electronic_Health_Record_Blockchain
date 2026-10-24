#!/usr/bin/env bash
# ==============================================================================
# start.sh — Launch Complete EHR Blockchain Network & Application Stack
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${ROOT_DIR}/bin:${PATH}"

HOSP_NET="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"

echo "════════════════════════════════════════════════════"
echo "      Starting EHR Blockchain Network & Stack       "
echo "════════════════════════════════════════════════════"

# 1. Start Fabric Network
if ! docker ps --filter "name=peer0.hospital.example.com" --format "{{.ID}}" | grep -q .; then
  echo "[1/3] Bringing up Hyperledger Fabric network..."
  (cd "${HOSP_NET}" && bash scripts/network-up.sh)
else
  echo "[1/3] Hyperledger Fabric network is already running."
fi

# 2. Deploy Chaincode if not yet committed
echo "[2/3] Verifying chaincode deployment..."
if ! (cd "${HOSP_NET}" && peer lifecycle chaincode querycommitted -C ehrchannel -n ehr 2>/dev/null | grep -q "Version: 1.0"); then
  echo "  [*] Deploying EHR chaincode..."
  (cd "${HOSP_NET}" && bash scripts/deployChaincode.sh \
    --channel ehrchannel \
    --chaincode-name ehr \
    --chaincode-path ../ehr-chaincode-v3 \
    --version 1.0 \
    --sequence 1)
else
  echo "  ✓ EHR chaincode is committed and active on ehrchannel."
fi

# 3. Start Backend APIs & Frontends
echo "[3/3] Starting backend services and web applications..."
"${ROOT_DIR}/start-sequential.sh" start

echo ""
echo "════════════════════════════════════════════════════"
echo "        EHR System is LIVE and Accessible           "
echo "════════════════════════════════════════════════════"
echo "  Hospital Web Portal : http://localhost:5173"
echo "  Patient Web Portal  : http://localhost:5174"
echo "  IPFS Web Gateway    : http://localhost:8090"
echo "  IPFS Node API       : http://localhost:5001"
echo ""
echo "  Backend Microservices:"
echo "    - IPFS Service    : http://localhost:4006/health"
echo "    - Reception/Admin : http://localhost:4001"
echo "    - Doctor API      : http://localhost:4002"
echo "    - Nurse/Pharmacy  : http://localhost:4003"
echo "    - Lab/Claims API  : http://localhost:4004"
echo "    - Patient API     : http://localhost:4005"
echo ""
echo "  Default Login Credentials:"
echo "    - Receptionist    : receptionist / password123"
echo "    - Doctor          : doctor / password123"
echo "    - Pharmacist      : pharmacist / password123"
echo "    - Admin           : hospitaladmin / password123"
echo "════════════════════════════════════════════════════"
