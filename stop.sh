#!/usr/bin/env bash
# ==============================================================================
# stop.sh — Stop All Running EHR Services and Fabric Network
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${ROOT_DIR}/bin:${PATH}"

HOSP_NET="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"

echo "════════════════════════════════════════════════════"
echo "      Stopping EHR Blockchain Network & Stack       "
echo "════════════════════════════════════════════════════"

# 1. Stop background applications
echo "[1/2] Stopping all web portals and microservices..."
"${ROOT_DIR}/start-sequential.sh" stop || true

# 2. Stop Fabric network
echo "[2/2] Tearing down Hyperledger Fabric network..."
if [ -d "${HOSP_NET}" ]; then
  (cd "${HOSP_NET}" && bash scripts/network-down.sh)
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ All EHR services and Fabric containers stopped. "
echo "════════════════════════════════════════════════════"
