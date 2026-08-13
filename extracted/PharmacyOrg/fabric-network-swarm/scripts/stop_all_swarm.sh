#!/bin/bash
set -euxo pipefail

# Configuration
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PC1_IP="100.124.176.94"
PC2_IP="100.83.121.98"
PC3_IP="100.117.138.55"
PC2_USER="rajput_mt"
PC3_USER="ronit"

echo "--- 1. Stopping Distributed App Processes ---"
# Kill Backend/Frontend on PC1
for PORT in 3000 3001 3002 3003 3004; do
  fuser -k "$PORT/tcp" 2>/dev/null || true
done

# Kill IPFS on PC1
pkill -f ipfs || true
rm -f /home/ankit/.ipfs/repo.lock || true

echo "--- 2. Removing Docker Stacks ---"
docker stack rm ehrswarm-ca ehrswarm-orderer ehrswarm-peer0 ehrswarm-peer1 ehrswarm-peer2 || true
echo "Waiting for stack removal (15s)..."
sleep 15

echo "--- 3. Wiping Persistent Data Across Cluster ---"

# Wipe PC1
echo "Wiping PC1 data (using Docker to bypass host permissions)..."
docker run --rm -v "$ROOT_DIR/data":/data alpine sh -c "rm -rf /data/ca /data/couchdb0 /data/orderer /data/peer0 /data/peer1 /data/peer2 /data/couchdb1 /data/couchdb2"
rm -f "$ROOT_DIR/mychannel.block" "$ROOT_DIR/ehr.tar.gz"

# Wipe PC2
echo "Wiping PC2 data (using Docker to bypass host permissions)..."
ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" "docker run --rm -v /home/$PC2_USER/fabric-network/fabric-network-swarm/data:/data alpine sh -c 'rm -rf /data/ca /data/couchdb1 /data/peer1'; rm -f /home/$PC2_USER/fabric-network/fabric-network-swarm/*.block /home/$PC2_USER/fabric-network/fabric-network-swarm/*.tar.gz" || echo "Failed to reach PC2"

# Wipe PC3
echo "Wiping PC3 data (using Docker to bypass host permissions)..."
ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" "docker run --rm -v /home/$PC3_USER/fabric-network/fabric-network-swarm/data:/data alpine sh -c 'rm -rf /data/ca /data/couchdb2 /data/peer2'; rm -f /home/$PC3_USER/fabric-network/fabric-network-swarm/*.block /home/$PC3_USER/fabric-network/fabric-network-swarm/*.tar.gz" || echo "Failed to reach PC3"

echo "--- 4. Final Cleanup of Orphan Containers ---"
docker container prune -f || true
docker volume prune -f || true

echo "--- SYSTEM FULLY STOPPED AND CLEANED ---"
echo "You can now run ./scripts/start_all_swarm.sh for a fresh start."
