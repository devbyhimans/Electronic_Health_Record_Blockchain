#!/bin/bash
set -euxo pipefail

# Configuration
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/compose"
SCRIPTS_DIR="$ROOT_DIR/scripts"
RUNTIME_DIR="$ROOT_DIR/runtime"
PC1_IP="100.124.176.94"
PC2_IP="100.83.121.98"
PC3_IP="100.117.138.55"
PC2_USER="rajput_mt"
PC3_USER="ronit"

echo "--- 1. Starting IPFS Daemon on PC1 ---"
pkill -f ipfs || true
rm -f /home/ankit/.ipfs/repo.lock

# Ensure IPFS accepts remote connections over the Swarm network
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080 || true

mkdir -p "$RUNTIME_DIR"
mkdir -p "$ROOT_DIR/data/ca" "$ROOT_DIR/data/orderer" "$ROOT_DIR/data/peer0" "$ROOT_DIR/data/couchdb0"
setsid ipfs daemon </dev/null > "$RUNTIME_DIR/ipfs.log" 2>&1 &
echo $! > "$RUNTIME_DIR/ipfs.pid"
sleep 3
echo "IPFS daemon started."

echo "--- 2. Deploying CA and Orderer Stacks ---"
docker stack deploy -c "$COMPOSE_DIR/stack-ca.yaml" ehrswarm-ca
docker stack deploy -c "$COMPOSE_DIR/stack-orderer.yaml" ehrswarm-orderer

echo "Waiting for orderer to initialize (30s)..."
sleep 30

echo "--- 3. Generating Artifacts (Local) ---"
export PATH=$PATH:/home/ankit/fabric-network/fabric-samples/bin
export FABRIC_CFG_PATH=/home/ankit/fabric-network/fabric-samples/config

echo "Packaging chaincode v2.0..."
peer lifecycle chaincode package "$ROOT_DIR/ehr.tar.gz" --path "$ROOT_DIR/chaincode/ehr" --lang node --label ehr_2.0

export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_ADDRESS=localhost:7051

echo "Ensuring channel exists on orderer..."
peer channel create -o localhost:7050 -c mychannel -f "$ROOT_DIR/channel-artifacts/mychannel.tx" --outputBlock "$ROOT_DIR/mychannel.block" --tls --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" || echo "Channel block already exists or creation failed"

echo "--- 4. Syncing to Workers ---"
for PC in "$PC2_IP" "$PC3_IP"; do
    PC_USER="rajput_mt"
    if [ "$PC" == "$PC3_IP" ]; then PC_USER="ronit"; fi
    
    echo "Syncing to $PC..."
    ssh -o BatchMode=yes "$PC_USER@$PC" "mkdir -p /home/$PC_USER/fabric-network/fabric-network-swarm/data/peer1 /home/$PC_USER/fabric-network/fabric-network-swarm/data/couchdb1 /home/$PC_USER/fabric-network/fabric-network-swarm/data/peer2 /home/$PC_USER/fabric-network/fabric-network-swarm/data/couchdb2" || echo "Failed to reach $PC"
    
    # Ensure system-wide symlink for Swarm volume mount parity
    ssh -o BatchMode=yes "$PC_USER@$PC" "sudo ln -sf /home/$PC_USER/fabric-network/fabric-network-swarm /srv/fabric-network-swarm" || echo "Symlink failed on $PC"

    # Sync crypto-config, compose files, and generated artifacts
    scp -o BatchMode=yes -r "$ROOT_DIR/crypto-config" "$PC_USER@$PC:/home/$PC_USER/fabric-network/fabric-network-swarm/" || true
    scp -o BatchMode=yes "$ROOT_DIR/compose/"*.yaml "$PC_USER@$PC:/home/$PC_USER/fabric-network/fabric-network-swarm/compose/" || true
    scp -o BatchMode=yes "$ROOT_DIR/ehr.tar.gz" "$PC_USER@$PC:/home/$PC_USER/fabric-network/fabric-network-swarm/" || true
    scp -o BatchMode=yes "$ROOT_DIR/mychannel.block" "$PC_USER@$PC:/home/$PC_USER/fabric-network/fabric-network-swarm/" || true
    scp -o BatchMode=yes "$ROOT_DIR/app/backend/connection.json" "$PC_USER@$PC:/home/$PC_USER/fabric-network/fabric-network-swarm/app/backend/" || true
done

echo "--- 5. Deploying Peer Stacks ---"
docker stack deploy -c "$COMPOSE_DIR/stack-peer0.yaml" ehrswarm-peer0
docker stack deploy -c "$COMPOSE_DIR/stack-peer1.yaml" ehrswarm-peer1
docker stack deploy -c "$COMPOSE_DIR/stack-peer2.yaml" ehrswarm-peer2

# ── Helper: wait until a peer container is running (up to 120s) ──────────────
wait_for_peer() {
    local label="$1"      # e.g. "ehrswarm-peer0_peer0"
    local ssh_target="$2" # empty for local, "user@ip" for remote
    local timeout=120
    local elapsed=0
    echo "Waiting for $label to start (up to ${timeout}s)..."
    while true; do
        if [[ -z "$ssh_target" ]]; then
            RUNNING=$(docker ps -q -f name="$label" 2>/dev/null)
        else
            RUNNING=$(ssh -o BatchMode=yes "$ssh_target" "docker ps -q -f name=\"$label\"" 2>/dev/null)
        fi
        [[ -n "$RUNNING" ]] && { echo "$label is up."; return 0; }
        [[ $elapsed -ge $timeout ]] && { echo "ERROR: $label did not start within ${timeout}s."; return 1; }
        sleep 5; elapsed=$((elapsed+5))
        echo "  ... still waiting ($elapsed s elapsed)"
    done
}

# ── Helper: join channel with up to 3 retries ────────────────────────────────
retry_join() {
    local peer_id="$1"
    local label="$2"
    for attempt in 1 2 3; do
        echo "  Attempt $attempt: joining $label to mychannel..."
        OUTPUT=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
            "$peer_id" peer channel join -b /etc/hyperledger/fabric/mychannel.block 2>&1)
        echo "$OUTPUT"
        echo "$OUTPUT" | grep -q "Successfully submitted" && { echo "  ✅ $label joined."; return 0; }
        echo "$OUTPUT" | grep -qiE "already exists|LedgerID already exists" && { echo "  ✅ $label already in channel."; return 0; }
        [[ $attempt -lt 3 ]] && { echo "  Retrying in 15s..."; sleep 15; }
    done
    echo "  ⚠️  WARNING: $label failed to join after 3 attempts."
    return 1
}

# ── Helper: idempotent chaincode install ─────────────────────────────────────
install_cc_if_needed() {
    local peer_id="$1"
    local label="$2"
    local INSTALLED=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
        "$peer_id" peer lifecycle chaincode queryinstalled 2>/dev/null | grep "ehr_2.0" || true)
    if [[ -n "$INSTALLED" ]]; then
        echo "  ✅ $label: chaincode already installed, skipping."
        return 0
    fi
    echo "  Installing chaincode on $label..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
        "$peer_id" peer lifecycle chaincode install /etc/hyperledger/fabric/ehr.tar.gz 2>&1 \
        && echo "  ✅ $label: chaincode installed." \
        || echo "  ⚠️  $label: chaincode install failed."
}

echo "--- 6. Joining Channel ---"
# Peer0 (local – PC1)
wait_for_peer "ehrswarm-peer0_peer0" ""
PEER0_ID=$(docker ps -q -f name=ehrswarm-peer0_peer0)
[[ -n "$PEER0_ID" ]] && retry_join "$PEER0_ID" "peer0"

# Peer1 (PC2)
wait_for_peer "ehrswarm-peer1_peer1" "$PC2_USER@$PC2_IP"
ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" bash <<'REMOTE'
    retry_join_remote() {
        local peer_id="$1"
        for attempt in 1 2 3; do
            echo "  Attempt $attempt: joining peer1 to mychannel..."
            OUTPUT=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
                "$peer_id" peer channel join -b /etc/hyperledger/fabric/mychannel.block 2>&1)
            echo "$OUTPUT"
            echo "$OUTPUT" | grep -q "Successfully submitted" && { echo "  ✅ peer1 joined."; return 0; }
            echo "$OUTPUT" | grep -qiE "already exists|LedgerID already exists" && { echo "  ✅ peer1 already in channel."; return 0; }
            [[ $attempt -lt 3 ]] && { echo "  Retrying in 15s..."; sleep 15; }
        done
        echo "  ⚠️  peer1 failed to join after 3 attempts."
        return 1
    }
    PEER1_ID=$(docker ps -q -f name=ehrswarm-peer1_peer1)
    if [[ -n "$PEER1_ID" ]]; then
        retry_join_remote "$PEER1_ID"
    else
        echo "ERROR: peer1 container not found on PC2"
    fi
REMOTE

# Peer2 (PC3)
wait_for_peer "ehrswarm-peer2_peer2" "$PC3_USER@$PC3_IP"
ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" bash <<'REMOTE'
    retry_join_remote() {
        local peer_id="$1"
        for attempt in 1 2 3; do
            echo "  Attempt $attempt: joining peer2 to mychannel..."
            OUTPUT=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
                "$peer_id" peer channel join -b /etc/hyperledger/fabric/mychannel.block 2>&1)
            echo "$OUTPUT"
            echo "$OUTPUT" | grep -q "Successfully submitted" && { echo "  ✅ peer2 joined."; return 0; }
            echo "$OUTPUT" | grep -qiE "already exists|LedgerID already exists" && { echo "  ✅ peer2 already in channel."; return 0; }
            [[ $attempt -lt 3 ]] && { echo "  Retrying in 15s..."; sleep 15; }
        done
        echo "  ⚠️  peer2 failed to join after 3 attempts."
        return 1
    }
    PEER2_ID=$(docker ps -q -f name=ehrswarm-peer2_peer2)
    if [[ -n "$PEER2_ID" ]]; then
        retry_join_remote "$PEER2_ID"
    else
        echo "ERROR: peer2 container not found on PC3"
    fi
REMOTE

echo "--- 7. Finalizing Chaincode Lifecycle ---"
# Install on Peer0 (local) — idempotent
PEER0_ID=$(docker ps -q -f name=ehrswarm-peer0_peer0)
install_cc_if_needed "$PEER0_ID" "peer0 (PC1)"

PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>/dev/null | grep "ehr_2.0" | cut -d' ' -f3 | tr -d ',' || true)
if [[ -z "$PACKAGE_ID" ]]; then
    echo "Installing chaincode on peer0 (first time)..."
    INSTALL_OUTPUT=$(peer lifecycle chaincode install "$ROOT_DIR/ehr.tar.gz" 2>&1 || true)
    echo "$INSTALL_OUTPUT"
    PACKAGE_ID=$(echo "$INSTALL_OUTPUT" | grep "Package ID:" | cut -d' ' -f3 | tr -d ',' || true)
    PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>/dev/null | grep "ehr_2.0" | cut -d' ' -f3 | tr -d ',' || true)
fi

if [[ -z "$PACKAGE_ID" ]]; then
    echo "FAILED: Could not determine Package ID"
    exit 1
fi
echo "Package ID: $PACKAGE_ID"

# Install on Peer1 (PC2) — idempotent
echo "Installing chaincode on Peer1 (PC2) if needed..."
ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" bash <<'REMOTE'
    PEER1_ID=$(docker ps -q -f name=ehrswarm-peer1_peer1)
    [[ -z "$PEER1_ID" ]] && { echo "peer1 not found, skipping CC install"; exit 0; }
    ALREADY=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
        "$PEER1_ID" peer lifecycle chaincode queryinstalled 2>/dev/null | grep "ehr_2.0" || true)
    if [[ -n "$ALREADY" ]]; then
        echo "  ✅ peer1: chaincode already installed, skipping."
    else
        docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
            "$PEER1_ID" peer lifecycle chaincode install /etc/hyperledger/fabric/ehr.tar.gz \
            && echo "  ✅ peer1: chaincode installed." \
            || echo "  ⚠️  peer1: chaincode install failed."
    fi
REMOTE

# Install on Peer2 (PC3) — idempotent
echo "Installing chaincode on Peer2 (PC3) if needed..."
ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" bash <<'REMOTE'
    PEER2_ID=$(docker ps -q -f name=ehrswarm-peer2_peer2)
    [[ -z "$PEER2_ID" ]] && { echo "peer2 not found, skipping CC install"; exit 0; }
    ALREADY=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
        "$PEER2_ID" peer lifecycle chaincode queryinstalled 2>/dev/null | grep "ehr_2.0" || true)
    if [[ -n "$ALREADY" ]]; then
        echo "  ✅ peer2: chaincode already installed, skipping."
    else
        docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
            "$PEER2_ID" peer lifecycle chaincode install /etc/hyperledger/fabric/ehr.tar.gz \
            && echo "  ✅ peer2: chaincode installed." \
            || echo "  ⚠️  peer2: chaincode install failed."
    fi
REMOTE

echo "Approving & Committing chaincode v1.0..."
peer lifecycle chaincode approveformyorg -o localhost:7050 --channelID mychannel --name ehr --version 1.0 \
    --package-id "$PACKAGE_ID" --sequence 1 --tls \
    --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    || echo "Approve skipped/already done"
peer lifecycle chaincode commit -o localhost:7050 --channelID mychannel --name ehr --version 1.0 --sequence 1 \
    --tls --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    || echo "Commit skipped/already done"

echo "--- 8. Starting Backend & Frontends ---"
# Automated Dependency Check
for APP_DIR in app/backend app/manager app/employee app/patient; do
    if [ ! -d "$ROOT_DIR/$APP_DIR/node_modules" ]; then
        echo "Installing dependencies for $APP_DIR..."
        cd "$ROOT_DIR/$APP_DIR" && npm install && cd -
    fi
done

sudo fuser -k 3000/tcp || true
sudo fuser -k 3001/tcp || true
sudo fuser -k 3002/tcp || true
sudo fuser -k 3003/tcp || true

echo "Importing wallets into the backend..."
bash "$SCRIPTS_DIR/import_wallet.sh"

bash "$SCRIPTS_DIR/start_app.sh"

echo "--- 9. Verifying Ledger Sync Across All Nodes ---"
bash "$SCRIPTS_DIR/verify_sync.sh"

echo "--- SYSTEM READY ---"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Pharmacy MedBlock v2.0 — Full Swarm Deployment Ready    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Backend API    → http://%s:3000  (Fabric + IPFS)     ║\n" "$PC1_IP"
printf "║  Manager  UI    → http://%s:3001  (Admin dashboard)   ║\n" "$PC1_IP"
printf "║  Billing  UI    → http://%s:3002  (Prescriptions)     ║\n" "$PC1_IP"
printf "║  Inventory UI   → http://%s:3003  (Stock mgmt)        ║\n" "$PC1_IP"
printf "║  Patient   UI   → http://%s:3004  (Self-Governance)   ║\n" "$PC1_IP"
printf "║  IPFS Gateway   → http://%s:8080/ipfs               ║\n" "$PC1_IP"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
