#!/bin/bash
# ============================================================
# start-all.sh — Complete One-Click Orchestrator
# Automates the setup of Hospital, Pharmacy, and Lab networks,
# then launches all 14 Node.js apps via Docker Compose.
# ============================================================

set -e

echo "============================================================"
echo " 1. Initializing Environment Configurations"
echo "============================================================"
# Automatically copy all .env.example files to .env across the repo
find . -type f -name ".env.example" -exec sh -c 'cp -n "$0" "${0%.example}"' {} \;
echo "Environment templates copied."

echo ""
echo "============================================================"
echo " 2. Starting Blockchain Networks"
echo "============================================================"
echo "NOTE: This step requires Fabric binaries. If they are missing,"
echo "you must download them per the docs/setup-guide.md instructions first."

echo "--> Starting Hospital Network..."
(cd orgs/hospital/EHR_hospitalOrg-main/ehr-network && bash scripts/network-up.sh || echo "Warning: Hospital network startup failed or binaries missing.")

echo "--> Starting Pharmacy Network..."
(cd orgs/pharmacy/fabric-network-swarm && bash deploy.sh || echo "Warning: Pharmacy deployment failed.")

echo "--> Starting Lab Network..."
(cd orgs/lab/EHR-LABORG-main && bash scripts/start-machine1.sh || echo "Warning: Lab network startup failed.")

echo ""
echo "============================================================"
echo " 3. Launching Application Tier (Docker Compose)"
echo "============================================================"
echo "Spinning up all 14 Node.js frontends and backends in Docker..."
docker compose up -d

echo ""
echo "============================================================"
echo " ALL SYSTEMS GO 🚀"
echo "============================================================"
echo "Hospital UIs : http://localhost:5173 (Reception) | :5174 (Patient)"
echo "Pharmacy UIs : http://localhost:3001 to 3005"
echo "Lab Gateway  : http://localhost:3006"
echo "============================================================"
