#!/bin/bash
# trace_swarm_flow.sh
# Streams logs from all 3 peers and the orderer simultaneously to visualize the Fabric lifecycle!

# Configuration
PC1_IP="100.124.176.94"
PC2_IP="100.83.121.98"
PC3_IP="100.117.138.55"
PC2_USER="rajput_mt"
PC3_USER="ronit"

echo "========================================================================"
echo "      Hyperledger Fabric Swarm - Real-Time Transaction Tracer"
echo "========================================================================"
echo "  [PC1] peer0.org1.example.com  (Local)"
echo "  [PC2] peer1.org1.example.com  (Remote)"
echo "  [PC3] peer2.org1.example.com  (Remote)"
echo "  [ORD] orderer.example.com     (Local Cluster)"
echo "========================================================================"
echo "Press Ctrl+C to stop the trace."
echo ""

# Find local container IDs
PEER0_ID=$(docker ps -q -f name=ehrswarm-peer0_peer0)
ORDERER_ID=$(docker ps -q -f name=ehrswarm-orderer_orderer)

# Function to tail logs with a prefix
tail_local() {
    local name=$1
    local id=$2
    local color=$3
    docker logs -f --tail 10 "$id" | sed "s/^/\x1b[${color}m[$name]\x1b[0m /"
}

tail_remote() {
    local name=$1
    local user=$2
    local ip=$3
    local container_name=$4
    local color=$5
    ssh -o BatchMode=yes "$user@$ip" "docker logs -f --tail 10 \$(docker ps -q -f name=$container_name)" | sed "s/^/\x1b[${color}m[$name]\x1b[0m /"
}

# Run all tails in parallel
# Use 31 (Red), 32 (Green), 34 (Blue), 35 (Magenta)
tail_local  "PEER0" "$PEER0_ID" "32" &
tail_remote "PEER1" "$PC2_USER" "$PC2_IP" "ehrswarm-peer1_peer1" "34" &
tail_remote "PEER2" "$PC3_USER" "$PC3_IP" "ehrswarm-peer2_peer2" "35" &
tail_local  "ORDER" "$ORDERER_ID" "31" &

# Wait for Ctrl+C
trap "kill 0" EXIT
wait
