#!/usr/bin/env bash
# ==============================================================================
# setup.sh — Automated Setup for EHR Hyperledger Fabric Blockchain System
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${ROOT_DIR}/bin:${PATH}"

echo "════════════════════════════════════════════════════"
echo "        EHR Blockchain System — Setup               "
echo "════════════════════════════════════════════════════"

# 1. Check prerequisites
echo "[1/4] Checking prerequisites..."
for tool in docker node npm curl jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[-] Missing prerequisite: $tool"
    echo "    Run: sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 nodejs npm curl jq"
    exit 1
  fi
  echo "  ✓ $tool ($(command -v "$tool"))"
done

# 2. Check Docker daemon & permissions
echo "[2/4] Verifying Docker socket access..."
if ! docker ps >/dev/null 2>&1; then
  echo "[-] Cannot connect to Docker daemon without sudo."
  echo "    Run: sudo chmod 666 /var/run/docker.sock"
  exit 1
fi
echo "  ✓ Docker daemon is active and accessible."

# 3. Pull required Docker images if missing
echo "[3/4] Checking Fabric and IPFS Docker images..."
REQUIRED_IMAGES=(
  "hyperledger/fabric-peer:latest"
  "hyperledger/fabric-orderer:latest"
  "hyperledger/fabric-ca:latest"
  "hyperledger/fabric-ccenv:2.5"
  "hyperledger/fabric-nodeenv:2.5"
  "ipfs/kubo:latest"
)

for img in "${REQUIRED_IMAGES[@]}"; do
  if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -qx "$img"; then
    echo "  [-] Missing $img. Pulling..."
    docker pull "$img"
  else
    echo "  ✓ Image present: $img"
  fi
done

# 4. Install Node.js dependencies
echo "[4/4] Installing application and chaincode dependencies..."
MODULES=(
  "orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/ipfs-service"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer0-api"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer1-api"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer2-api"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/extorg-api"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/patient-api"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/hospital-portal"
  "orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/patient-portal"
  "orgs/lab/EHR-LABORG-main/client/node-gateway"
  "orgs/pharmacy/fabric-network-swarm/app/frontend"
)

for mod in "${MODULES[@]}"; do
  target="${ROOT_DIR}/${mod}"
  if [ -d "$target" ]; then
    echo "  [*] Installing dependencies in $mod..."
    (cd "$target" && npm install --silent)
    echo "  ✓ $mod ready"
  fi
done

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ Setup Complete! Next run: ./start.sh"
echo "════════════════════════════════════════════════════"
