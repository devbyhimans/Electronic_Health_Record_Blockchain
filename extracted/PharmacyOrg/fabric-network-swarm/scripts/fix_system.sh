#!/bin/bash
# scripts/fix_system.sh
# Fixes IPFS locks and resets the backend connections.

echo "--- 1. Fixing IPFS (Killing & Clearing Locks) ---"
pkill -f ipfs || true
rm -f /home/ankit/.ipfs/repo.lock
echo "Starting IPFS daemon..."
setsid ipfs daemon </dev/null > /home/ankit/fabric-network/fabric-network-swarm/runtime/ipfs.log 2>&1 &
sleep 5
curl -s http://localhost:5001/api/v0/version && echo "IPFS is UP" || echo "IPFS still failing"

echo "--- 2. Restarting Backend ---"
# Kill existing backend
sudo fuser -k 3000/tcp || true
cd /home/ankit/fabric-network/fabric-network-swarm/app/backend
# Re-import wallets to ensure they are fresh (doesn't hurt)
bash ../../scripts/import_wallet.sh
# Run start_app.sh to bring up everything
bash ../../scripts/start_app.sh

echo "--- SYSTEM REPAIR COMPLETE ---"
