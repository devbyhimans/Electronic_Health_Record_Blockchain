#!/usr/bin/env bash
# Stop services while preserving Fabric identities, ledger data, and volumes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_COMPOSE="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml"
APP_COMPOSE="${ROOT_DIR}/docker-compose.yaml"

echo "Stopping application containers (Docker volumes are preserved)…"
docker compose -f "${APP_COMPOSE}" --profile dashboard stop || true
echo "Stopping Fabric containers (Docker volumes and identity files are preserved)…"
docker compose -f "${FABRIC_COMPOSE}" stop || true
echo "Services stopped. Run ./start.sh to start them again."
