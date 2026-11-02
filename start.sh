#!/usr/bin/env bash
# Start the existing Fabric network and application services without resetting
# crypto material, channel data, chaincode, or Docker volumes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-network"
FABRIC_COMPOSE="${FABRIC_DIR}/docker/docker-compose-network.yaml"
CA_COMPOSE="${FABRIC_DIR}/docker/docker-compose-ca.yaml"
APP_COMPOSE="${ROOT_DIR}/docker-compose.yaml"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine and the Docker Compose plugin are required." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not accessible. Start Docker and ensure your account can run 'docker ps'." >&2
  exit 1
fi
if [[ ! -f "${FABRIC_COMPOSE}" || ! -f "${CA_COMPOSE}" || ! -f "${APP_COMPOSE}" ]]; then
  echo "Required Fabric or application Compose file is missing." >&2
  exit 1
fi

for identity_dir in \
  "${FABRIC_DIR}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp" \
  "${FABRIC_DIR}/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/msp"; do
  if [[ ! -d "${identity_dir}" ]]; then
    echo "Existing Fabric identity material was not found at: ${identity_dir}" >&2
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
    echo "Existing Fabric CA state was not found at: ${ca_state}" >&2
    echo "This startup script will not initialize or replace a certificate authority." >&2
    exit 1
  fi
done

if ! docker network inspect ehr_network >/dev/null 2>&1; then
  echo "Creating the shared Docker network ehr_network…"
  docker network create ehr_network >/dev/null
fi

echo "[1/6] Starting existing Fabric certificate authorities…"
docker compose -f "${CA_COMPOSE}" up -d

echo "[2/6] Starting existing Fabric peers and orderer (no channel or chaincode changes)…"
docker compose -f "${FABRIC_COMPOSE}" up -d

echo "[3/6] Starting hospital, patient, lab, IPFS, and Nginx services…"
docker compose -f "${APP_COMPOSE}" up -d --build \
  h-ipfs-service h-peer0-api h-peer1-api h-peer2-api h-extorg-api h-patient-api \
  h-hospital-portal h-patient-portal l-node-gateway nginx

if [[ -f "${ROOT_DIR}/orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/.env" ]]; then
  echo "[4/6] Starting the dashboard API and portal…"
  docker compose -f "${APP_COMPOSE}" --profile dashboard up -d --build h-dashboard-api h-dashboard-portal
else
  echo "[4/6] Dashboard skipped: configure dashboard-api/.env from .env.example to enable it."
fi

echo "[5/6] Starting the six separate pharmacy apps…"
if docker compose -f "${APP_COMPOSE}" up -d --build p-backend; then
  echo "Pharmacy API container started."
else
  echo "WARNING: Pharmacy API did not start; continuing with the other services." >&2
fi
if docker compose -f "${APP_COMPOSE}" up -d --build \
  p-manager p-employee p-inventory p-billing p-frontend p-patient; then
  echo "Pharmacy portal containers started."
else
  echo "WARNING: One or more pharmacy portals did not start. Other services remain running." >&2
  echo "See: docker compose logs p-manager p-employee p-inventory p-billing p-frontend p-patient" >&2
fi

echo "[6/6] Checking service containers…"
docker compose -f "${APP_COMPOSE}" --profile dashboard ps
echo
echo "Workspace:       http://localhost/"
echo "Hospital portal: http://localhost:5173/"
echo "Patient portal:  http://localhost:5174/"
echo "System dashboard: http://localhost/dashboard/"
echo "Lab service:     http://localhost/lab/"
echo
echo "The home page checks live service endpoints. Unavailable integrations stay marked unavailable."
