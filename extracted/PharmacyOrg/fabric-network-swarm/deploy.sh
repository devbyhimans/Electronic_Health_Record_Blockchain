#!/bin/bash
# =============================================================================
#  MedBlock v2 - One-Click Full Deployment Script
#  Usage:  bash deploy.sh [--skip-seed] [--no-wipe]
#
#  Options:
#    --skip-seed   Skip seeding dummy data (use existing ledger)
#    --no-wipe     Keep existing ledger data (don't wipe volumes)
#    --apps-only   Only restart the frontend/backend apps (no Fabric changes)
#    --help        Show this help
# =============================================================================
set -euo pipefail

# --- CONFIGURATION ------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
COMPOSE_DIR="$ROOT_DIR/compose"
RUNTIME_DIR="$ROOT_DIR/runtime"

# IPs and SSH users
PC1_IP="100.124.176.94"
PC2_IP="100.83.121.98"
PC3_IP="100.117.138.55"
PC2_USER="rajput_mt"
PC3_USER="ronit"

# Fabric tooling
FABRIC_BIN="/home/ankit/fabric-network/fabric-samples/bin"
FABRIC_CFG="/home/ankit/fabric-network/fabric-samples/config"
export PATH="$FABRIC_BIN:$PATH"
export FABRIC_CFG_PATH="$FABRIC_CFG"

# Chaincode config  - bump CC_VERSION + CC_SEQUENCE when you change chaincode
CC_LABEL="ehr_2.1"
CC_VERSION="2.1"
CC_SEQUENCE="2"     # Must be incremented each time code changes
CC_PACKAGE="$ROOT_DIR/ehr_v2.1.tar.gz"

# Ports
BACKEND_PORT=3000
MANAGER_PORT=3001
EMPLOYEE_PORT=3002
INVENTORY_PORT=3003
PATIENT_PORT=3004

# Peer TLS config (Peer0)
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
ORDERER_CA="$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
PEER0_TLS="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"

# --- FLAGS --------------------------------------------------------------------
SKIP_SEED=false
NO_WIPE=false
APPS_ONLY=false

for arg in "$@"; do
    case $arg in
        --skip-seed)  SKIP_SEED=true ;;
        --no-wipe)    NO_WIPE=true ;;
        --apps-only)  APPS_ONLY=true ;;
        --help)
            echo "Usage: bash deploy.sh [--skip-seed] [--no-wipe] [--apps-only]"
            echo ""
            echo "  --skip-seed   Don't run seed_dummy_data.sh"
            echo "  --no-wipe     Keep ledger data between restarts"
            echo "  --apps-only   Only restart apps (no Fabric restart)"
            exit 0
            ;;
    esac
done

# --- HELPERS ------------------------------------------------------------------
log()  { echo -e "\n\033[1;34m> $*\033[0m"; }
ok()   { echo -e "  \033[1;32mOK $*\033[0m"; }
warn() { echo -e "  \033[1;33mWARN  $*\033[0m"; }

wait_for_peer() {
    local label="$1" ssh_target="${2:-}" timeout=120 elapsed=0
    echo "  Waiting for $label (up to ${timeout}s)..."
    while true; do
        if [[ -z "$ssh_target" ]]; then
            RUNNING=$(docker ps -q -f name="$label" 2>/dev/null || true)
        else
            RUNNING=$(ssh -o BatchMode=yes "$ssh_target" "docker ps -q -f name=\"$label\"" 2>/dev/null || true)
        fi
        [[ -n "$RUNNING" ]] && { ok "$label is up."; return 0; }
        [[ $elapsed -ge $timeout ]] && { warn "$label did not start in ${timeout}s - continuing anyway."; return 1; }
        sleep 5; elapsed=$((elapsed+5))
        echo "    ... ${elapsed}s elapsed"
    done
}

retry_join_local() {
    local peer_id="$1" label="$2"
    for attempt in 1 2 3; do
        echo "    Attempt $attempt: joining $label to mychannel..."
        OUT=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
            "$peer_id" peer channel join -b /etc/hyperledger/fabric/mychannel.block 2>&1 || true)
        echo "$OUT" | grep -q "Successfully submitted" && { ok "$label joined."; return 0; }
        echo "$OUT" | grep -qiE "already exists|LedgerID already exists" && { ok "$label already in channel."; return 0; }
        [[ $attempt -lt 3 ]] && { warn "Retrying in 10s..."; sleep 10; }
    done
    warn "$label failed after 3 attempts."
}

retry_join_remote() {
    local user_host="$1" label="$2" svc_name="$3" block_path="$4"
    ssh -o BatchMode=yes "$user_host" bash <<REMOTE
set +e
for attempt in 1 2 3; do
    ID=\$(docker ps -q -f name="$svc_name" 2>/dev/null | head -1)
    [[ -z "\$ID" ]] && { echo "  $label container not running on remote."; sleep 10; continue; }
    # Copy the genesis block into the container (stack YAML may not mount it)
    docker cp "$block_path" "\$ID:/tmp/mychannel.block" 2>/dev/null || true
    # Also inject the chaincode package just in case bind-mount failed
    docker cp "/srv/fabric-network-swarm/ehr.tar.gz" "\$ID:/etc/hyperledger/fabric/ehr.tar.gz" 2>/dev/null || true
    OUT=\$(docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
        "\$ID" peer channel join -b /tmp/mychannel.block 2>&1)
    echo "\$OUT"
    echo "\$OUT" | grep -q "Successfully submitted" && { echo "OK $label joined."; exit 0; }
    echo "\$OUT" | grep -qiE "already exists|LedgerID" && { echo "OK $label already in channel."; exit 0; }
    sleep 10
done
echo "WARN $label join failed (non-fatal)."
REMOTE
}

# --- STEP 0: APPS ONLY MODE --------------------------------------------------
if $APPS_ONLY; then
    log "APPS ONLY MODE - Restarting frontends and backend"
    for PORT in $BACKEND_PORT $MANAGER_PORT $EMPLOYEE_PORT $INVENTORY_PORT $PATIENT_PORT; do
        fuser -k "${PORT}/tcp" 2>/dev/null || true
    done
    pkill -f "node app.js" 2>/dev/null || true
    pkill -f "vite"         2>/dev/null || true
    sleep 2
    bash "$SCRIPTS_DIR/start_app.sh"
    ok "Apps restarted!"
    exit 0
fi

# --- STEP 1: STOP EVERYTHING -------------------------------------------------
log "STEP 1: Stopping all services"
for PORT in $BACKEND_PORT $MANAGER_PORT $EMPLOYEE_PORT $INVENTORY_PORT $PATIENT_PORT; do
    fuser -k "${PORT}/tcp" 2>/dev/null || true
done
pkill -f "node app.js" 2>/dev/null || true
pkill -f "vite"         2>/dev/null || true
pkill -f "ipfs"         2>/dev/null || true
rm -f /home/ankit/.ipfs/repo.lock 2>/dev/null || true

docker stack rm ehrswarm-ca ehrswarm-orderer ehrswarm-peer0 ehrswarm-peer1 ehrswarm-peer2 2>/dev/null || true
echo "  Waiting for stacks to remove (15s)..."
sleep 15

# --- STEP 2: WIPE DATA -------------------------------------------------------
if ! $NO_WIPE; then
    log "STEP 2: Wiping ledger data"
    docker run --rm -v "$ROOT_DIR/data":/data alpine sh -c \
        "rm -rf /data/ca /data/couchdb0 /data/orderer /data/peer0 /data/couchdb1 /data/peer1 /data/couchdb2 /data/peer2" || true
    rm -f "$ROOT_DIR/mychannel.block" "$ROOT_DIR/ehr.tar.gz" "$ROOT_DIR/ehr_v"*.tar.gz 2>/dev/null || true

    # Wipe worker nodes
    ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" \
        "docker run --rm -v /home/$PC2_USER/fabric-network/fabric-network-swarm/data:/data alpine sh -c 'rm -rf /data/*'; rm -f /home/$PC2_USER/fabric-network/fabric-network-swarm/*.block /home/$PC2_USER/fabric-network/fabric-network-swarm/*.tar.gz" \
        2>/dev/null || warn "PC2 wipe failed (continuing)"
    ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" \
        "docker run --rm -v /home/$PC3_USER/fabric-network/fabric-network-swarm/data:/data alpine sh -c 'rm -rf /data/*'; rm -f /home/$PC3_USER/fabric-network/fabric-network-swarm/*.block /home/$PC3_USER/fabric-network/fabric-network-swarm/*.tar.gz" \
        2>/dev/null || warn "PC3 wipe failed (continuing)"

    docker container prune -f 2>/dev/null || true
    ok "Data wiped."
else
    log "STEP 2: Skipping data wipe (--no-wipe)"
fi

# --- STEP 3: IPFS ------------------------------------------------------------
log "STEP 3: Starting IPFS"
mkdir -p "$RUNTIME_DIR"
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080 2>/dev/null || true
setsid ipfs daemon </dev/null >"$RUNTIME_DIR/ipfs.log" 2>&1 &
echo $! >"$RUNTIME_DIR/ipfs.pid"
sleep 4
ok "IPFS daemon started."

# --- STEP 4: FABRIC INFRASTRUCTURE -------------------------------------------
log "STEP 4: Preparing artifacts and deploying the Fabric stack"
mkdir -p "$ROOT_DIR/data/ca" "$ROOT_DIR/data/orderer" \
         "$ROOT_DIR/data/peer0" "$ROOT_DIR/data/couchdb0" \
         "$ROOT_DIR/data/peer1" "$ROOT_DIR/data/couchdb1" \
         "$ROOT_DIR/data/peer2" "$ROOT_DIR/data/couchdb2"

# -- 4a: Package chaincode FIRST so bind-mounts exist when peers start --
log "STEP 4a: Packaging chaincode (must exist before peer stacks deploy)"
# Pull required builder image
docker pull hyperledger/fabric-nodeenv:2.5 2>/dev/null || warn "fabric-nodeenv pull failed - may cause slow first install"

peer lifecycle chaincode package "$CC_PACKAGE" \
    --path "$ROOT_DIR/chaincode/ehr" \
    --lang node \
    --label "$CC_LABEL"
# Also place it at the unversioned path that stack-peer*.yaml bind-mounts
cp "$CC_PACKAGE" "$ROOT_DIR/ehr.tar.gz"
ok "Chaincode packaged → $(basename "$CC_PACKAGE") and ehr.tar.gz"

# -- 4b: Deploy CA and Orderer -----------------------------------------
log "STEP 4b: Deploying CA and Orderer"
docker stack deploy -c "$COMPOSE_DIR/stack-ca.yaml"      ehrswarm-ca
docker stack deploy -c "$COMPOSE_DIR/stack-orderer.yaml" ehrswarm-orderer
echo "  Waiting 30s for orderer to initialize..."
sleep 30

# -- 4c: Create channel block ------------------------------------------
peer channel create \
    -o localhost:7050 \
    -c mychannel \
    -f "$ROOT_DIR/channel-artifacts/mychannel.tx" \
    --outputBlock "$ROOT_DIR/mychannel.block" \
    --tls --cafile "$ORDERER_CA" \
    2>/dev/null || warn "Channel block already exists - using existing mychannel.block"

# -- 4d: Sync ALL required files to workers BEFORE deploying their peer stacks --
# (Docker Swarm validates bind-mounts on the host where the container runs)
log "STEP 5: Syncing artifacts to worker nodes (before peer stacks start)"
for PC_INFO in "$PC2_USER@$PC2_IP" "$PC3_USER@$PC3_IP"; do
    echo "  Syncing to $PC_INFO..."
    # Get home dir for this user
    PC_HOME=$(ssh -o BatchMode=yes "$PC_INFO" "echo \$HOME" 2>/dev/null || echo "/home/${PC_INFO%%@*}")
    PC_ROOT="$PC_HOME/fabric-network/fabric-network-swarm"

    ssh -o BatchMode=yes "$PC_INFO" \
        "mkdir -p $PC_ROOT/data/peer1 $PC_ROOT/data/peer2 \
                  $PC_ROOT/data/couchdb1 $PC_ROOT/data/couchdb2 \
                  $PC_ROOT/compose $PC_ROOT/app/backend" \
        2>/dev/null || warn "mkdir failed on $PC_INFO"

    # Create /srv symlink so stack bind-mounts resolve (stack YAMLs use /srv/fabric-network-swarm/...)
    ssh -o BatchMode=yes "$PC_INFO" \
        "sudo ln -sfn $PC_ROOT /srv/fabric-network-swarm" \
        2>/dev/null || warn "Could not create /srv symlink on $PC_INFO - bind mounts may fail"

    scp -o BatchMode=yes -r "$ROOT_DIR/crypto-config" \
        "$PC_INFO:$PC_ROOT/"                              2>/dev/null || warn "crypto-config sync failed for $PC_INFO"
    scp -o BatchMode=yes "$ROOT_DIR/compose/"*.yaml \
        "$PC_INFO:$PC_ROOT/compose/"                      2>/dev/null || true
    scp -o BatchMode=yes "$ROOT_DIR/mychannel.block" \
        "$PC_INFO:$PC_ROOT/"                              2>/dev/null || true
    # WARN  Critical: ehr.tar.gz must exist on worker nodes for peer bind-mounts
    scp -o BatchMode=yes "$ROOT_DIR/ehr.tar.gz" \
        "$PC_INFO:$PC_ROOT/"                              2>/dev/null || warn "ehr.tar.gz sync failed for $PC_INFO"
    scp -o BatchMode=yes "$ROOT_DIR/app/backend/connection.json" \
        "$PC_INFO:$PC_ROOT/app/backend/"                  2>/dev/null || true
done
ok "Worker sync complete."


# -- 4e: Now deploy peer stacks - all bind-mount sources exist on every node --
docker stack deploy -c "$COMPOSE_DIR/stack-peer0.yaml" ehrswarm-peer0
docker stack deploy -c "$COMPOSE_DIR/stack-peer1.yaml" ehrswarm-peer1
docker stack deploy -c "$COMPOSE_DIR/stack-peer2.yaml" ehrswarm-peer2

# --- STEP 6: JOIN CHANNEL ----------------------------------------------------
log "STEP 6: Joining peers to channel"

# Helper: map Docker Swarm hostname to SSH target
get_ssh_target() {
    local hostname="$1"
    case "$hostname" in
        *ankit*)    echo "" ;;                           # local (manager)
        *rajput*)   echo "$PC2_USER@$PC2_IP" ;;
        *ronit*)    echo "$PC3_USER@$PC3_IP" ;;
        *)          echo "" ;;
    esac
}

# Wait for service to be running (checks from manager via docker service ps)
wait_for_service() {
    local svc="$1" timeout=120 elapsed=0
    echo "  Waiting for $svc to be running (up to ${timeout}s)..."
    while true; do
        STATE=$(docker service ps "$svc" --format '{{.CurrentState}}' 2>/dev/null | head -1)
        [[ "$STATE" == Running* ]] && { ok "$svc is running."; return 0; }
        [[ $elapsed -ge $timeout ]] && { warn "$svc not running after ${timeout}s - skipping."; return 1; }
        sleep 5; elapsed=$((elapsed+5))
        echo "    ... ${elapsed}s (state: ${STATE:-pending})"
    done
}

# Join a peer to channel (works for both local and remote)
join_peer_to_channel() {
    local svc_name="$1" label="$2"
    local node_hostname
    node_hostname=$(docker service ps "$svc_name" --format '{{.Node}}' 2>/dev/null | head -1)
    local ssh_target
    ssh_target=$(get_ssh_target "$node_hostname")
    echo "  $label is on node: $node_hostname (target: ${ssh_target:-local})"
    
    if [[ -z "$ssh_target" ]]; then
        # LOCAL: peer is on manager node
        local peer_id
        peer_id=$(docker ps -q -f name="$svc_name" | head -1)
        [[ -z "$peer_id" ]] && { warn "$label container not found locally."; return 1; }
        retry_join_local "$peer_id" "$label"
    else
        # REMOTE: peer is on a worker node
        retry_join_remote "$ssh_target" "$label" "$svc_name" "/srv/fabric-network-swarm/mychannel.block"
    fi
}

# Join all 3 peers
wait_for_service "ehrswarm-peer0_peer0" && join_peer_to_channel "ehrswarm-peer0_peer0" "peer0"
wait_for_service "ehrswarm-peer1_peer1" && join_peer_to_channel "ehrswarm-peer1_peer1" "peer1"
wait_for_service "ehrswarm-peer2_peer2" && join_peer_to_channel "ehrswarm-peer2_peer2" "peer2"

# --- STEP 7: CHAINCODE LIFECYCLE ---------------------------------------------
log "STEP 7: Committing chaincode to channel ($CC_LABEL)"
# Chaincode was already packaged in step 4a - just install and commit
echo "  Waiting 15s for peers to stabilize before chaincode install..."
sleep 15

# Install on Peer0
peer lifecycle chaincode install "$CC_PACKAGE"

# Get Package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>/dev/null \
    | grep "$CC_LABEL" | head -n1 | cut -d' ' -f3 | cut -d',' -f1)
echo "  Package ID: $PACKAGE_ID"

# Auto-detect next sequence number (1 for fresh channel, increment if chaincode already committed)
CURRENT_SEQ=$(peer lifecycle chaincode querycommitted -C mychannel --name ehr 2>/dev/null \
    | grep "Sequence:" | awk '{print $2}' | tr -d ',' || echo "0")
CC_SEQUENCE=$(( CURRENT_SEQ + 1 ))
echo "  Current sequence on ledger: $CURRENT_SEQ → Using sequence: $CC_SEQUENCE"

# Approve
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --channelID mychannel \
    --name ehr \
    --version "$CC_VERSION" \
    --package-id "$PACKAGE_ID" \
    --sequence "$CC_SEQUENCE" \
    --tls --cafile "$ORDERER_CA"

# Commit
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --channelID mychannel \
    --name ehr \
    --version "$CC_VERSION" \
    --sequence "$CC_SEQUENCE" \
    --tls --cafile "$ORDERER_CA" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "$PEER0_TLS"

ok "Chaincode committed: $CC_LABEL Sequence $CC_SEQUENCE"

# Import wallets
log "STEP 7b: Importing identities into wallet"
bash "$SCRIPTS_DIR/import_wallet.sh" 2>/dev/null || warn "import_wallet.sh failed (check manually)"

# --- STEP 8: START APPS ------------------------------------------------------
log "STEP 8: Starting backend and frontend apps"

# Install npm deps if needed
for APP_DIR in app/backend app/manager app/billing app/inventory app/patient; do
    if [[ -f "$ROOT_DIR/$APP_DIR/package.json" ]] && [[ ! -d "$ROOT_DIR/$APP_DIR/node_modules" ]]; then
        echo "  Installing deps for $APP_DIR..."
        (cd "$ROOT_DIR/$APP_DIR" && npm install --silent) || true
    fi
done

# Kill old process using ports
for PORT in $BACKEND_PORT $MANAGER_PORT $EMPLOYEE_PORT $INVENTORY_PORT $PATIENT_PORT; do
    fuser -k "${PORT}/tcp" 2>/dev/null || true
done
sleep 1

bash "$SCRIPTS_DIR/start_app.sh"

# --- STEP 9: SEED DATA -------------------------------------------------------
if ! $SKIP_SEED; then
    log "STEP 9: Seeding dummy data"
    echo "  Waiting 15s for backend to fully start..."
    sleep 15
    bash "$SCRIPTS_DIR/seed_dummy_data.sh"
    ok "Dummy data seeded."
else
    log "STEP 9: Skipping seed (--skip-seed)"
fi

# --- DONE ---------------------------------------------------------------------
echo ""
echo "+------------------------------------------------------------------╗"
echo "|         H MedBlock v2 - System Ready                           |"
echo "+------------------------------------------------------------------+"
printf "|  Manager  UI  → http://%-37s |\n" "$PC1_IP:$MANAGER_PORT"
printf "|  Pharmacist   → http://%-37s |\n" "$PC1_IP:$EMPLOYEE_PORT  (Identity: ph_alice)"
printf "|  Inventory    → http://%-37s |\n" "$PC1_IP:$INVENTORY_PORT  (Identity: inv_bob)"
printf "|  Patient  UI  → http://%-37s |\n" "$PC1_IP:$PATIENT_PORT  (Identity: pat001)"
printf "|  Backend API  → http://%-37s |\n" "$PC1_IP:$BACKEND_PORT"
printf "|  IPFS Gateway → http://%-37s |\n" "$PC1_IP:8080/ipfs"
echo "+------------------------------------------------------------------+"
echo "|  Logs: runtime/backend.log  runtime/manager.log etc.            |"
echo "+------------------------------------------------------------------+"
