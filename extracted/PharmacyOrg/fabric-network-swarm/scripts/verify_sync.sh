#!/bin/bash
# verify_sync.sh — Check that all Fabric peers have the same ledger height and block hash.
# Run this any time to confirm all nodes are in sync.
# Usage: bash scripts/verify_sync.sh

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PC2_USER="rajput_mt"
PC2_IP="100.83.121.98"
PC3_USER="ronit"
PC3_IP="100.117.138.55"
CHANNEL="mychannel"

TMPDIR_SYNC=$(mktemp -d)
trap 'rm -rf "$TMPDIR_SYNC"' EXIT

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "     Fabric Ledger Sync Verification — channel: $CHANNEL"
echo "════════════════════════════════════════════════════════════════"

# Collect info from all 3 peers in parallel using temp files
(
    P=$(docker ps -q -f name=ehrswarm-peer0_peer0 2>/dev/null)
    if [[ -n "$P" ]]; then
        docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
            "$P" peer channel getinfo -c "$CHANNEL" 2>/dev/null \
            | grep "Blockchain info:" | sed 's/.*Blockchain info: //' > "$TMPDIR_SYNC/peer0.json"
    else
        echo '{"height":"?","currentBlockHash":"?"}' > "$TMPDIR_SYNC/peer0.json"
    fi
) &

(
    ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" \
        'P=$(docker ps -q -f name=ehrswarm-peer1_peer1 2>/dev/null)
         if [[ -n "$P" ]]; then
             docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
                 "$P" peer channel getinfo -c mychannel 2>/dev/null \
                 | grep "Blockchain info:" | sed "s/.*Blockchain info: //"
         else
             echo '"'"'{"height":"?","currentBlockHash":"?"}'"'"'
         fi' > "$TMPDIR_SYNC/peer1.json" 2>/dev/null || echo '{"height":"?","currentBlockHash":"?"}' > "$TMPDIR_SYNC/peer1.json"
) &

(
    ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" \
        'P=$(docker ps -q -f name=ehrswarm-peer2_peer2 2>/dev/null)
         if [[ -n "$P" ]]; then
             docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \
                 "$P" peer channel getinfo -c mychannel 2>/dev/null \
                 | grep "Blockchain info:" | sed "s/.*Blockchain info: //"
         else
             echo '"'"'{"height":"?","currentBlockHash":"?"}'"'"'
         fi' > "$TMPDIR_SYNC/peer2.json" 2>/dev/null || echo '{"height":"?","currentBlockHash":"?"}' > "$TMPDIR_SYNC/peer2.json"
) &

wait  # Wait for all 3 background jobs

# Parse JSON from temp files
parse() {
    local file="$1"
    local field="$2"
    python3 -c "import sys,json; d=json.load(open('$file')); print(d.get('$field','?'))" 2>/dev/null || echo "?"
}

HEIGHT0=$(parse "$TMPDIR_SYNC/peer0.json" "height")
HEIGHT1=$(parse "$TMPDIR_SYNC/peer1.json" "height")
HEIGHT2=$(parse "$TMPDIR_SYNC/peer2.json" "height")
HASH0=$(parse "$TMPDIR_SYNC/peer0.json" "currentBlockHash")
HASH1=$(parse "$TMPDIR_SYNC/peer1.json" "currentBlockHash")
HASH2=$(parse "$TMPDIR_SYNC/peer2.json" "currentBlockHash")

printf "\n%-12s %-8s %-28s %s\n" "Peer" "Height" "Block Hash (short)" "Status"
printf "%s\n" "──────────────────────────────────────────────────────────"

ALL_OK=true
LABELS=("peer0 (PC1)" "peer1 (PC2)" "peer2 (PC3)")
HEIGHTS=("$HEIGHT0" "$HEIGHT1" "$HEIGHT2")
HASHES=("$HASH0" "$HASH1" "$HASH2")

for i in 0 1 2; do
    H="${HEIGHTS[$i]}"
    FH="${HASHES[$i]}"
    SHORT="${FH:0:20}..."

    if [[ "$H" == "?" ]] || [[ "$FH" == "?" ]]; then
        STATUS="❌ ERROR (container not found)"
        ALL_OK=false
    elif [[ "$FH" == "$HASH0" ]] && [[ "$H" == "$HEIGHT0" ]]; then
        STATUS="✅ IN SYNC"
    else
        STATUS="❌ OUT OF SYNC"
        ALL_OK=false
    fi
    printf "%-12s %-8s %-28s %s\n" "${LABELS[$i]}" "$H" "$SHORT" "$STATUS"
done

echo ""
if $ALL_OK; then
    echo "✅  ALL PEERS ARE IN SYNC — height: $HEIGHT0"
    exit 0
else
    echo "❌  SYNC MISMATCH DETECTED"
    echo "    Check peer logs with: docker service logs ehrswarm-peer2_peer2"
    exit 1
fi
