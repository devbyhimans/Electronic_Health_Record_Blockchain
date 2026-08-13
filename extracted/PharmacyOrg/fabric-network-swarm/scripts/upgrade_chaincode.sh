#!/bin/bash
# upgrade_chaincode.sh — Re-packages and upgrades the EHR chaincode to v2.0
# Run this while the Fabric swarm is active.
# Usage: ./scripts/upgrade_chaincode.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAINCODE_DIR="$ROOT_DIR/chaincode/ehr"
NEW_VERSION="2.0"
SEQUENCE="2"
CHANNEL_NAME="${FABRIC_CHANNEL_NAME:-mychannel}"
CC_NAME="${FABRIC_CHAINCODE_NAME:-ehr}"

echo "======================================================"
echo " Pharmacy MedBlock — Chaincode Upgrade to v${NEW_VERSION}"
echo "======================================================"
echo " Channel   : $CHANNEL_NAME"
echo " Chaincode : $CC_NAME"
echo " Version   : $NEW_VERSION (sequence $SEQUENCE)"
echo ""

# 1. Install dependencies
echo "▶ Installing chaincode node_modules…"
cd "$CHAINCODE_DIR"
npm install --quiet

# 2. Package the chaincode
echo "▶ Packaging chaincode…"
cd "$ROOT_DIR"
docker exec cli peer lifecycle chaincode package \
    /tmp/${CC_NAME}_v${NEW_VERSION}.tar.gz \
    --path /opt/gopath/src/github.com/chaincode/${CC_NAME} \
    --lang node \
    --label ${CC_NAME}_${NEW_VERSION} 2>/dev/null || true

# Fallback: package from host using peer binary if 'cli' container not available
if ! docker ps --format '{{.Names}}' | grep -q '^cli$'; then
    echo "  (no 'cli' container; attempting host peer binary)"
    peer lifecycle chaincode package /tmp/${CC_NAME}_v${NEW_VERSION}.tar.gz \
        --path "$CHAINCODE_DIR" \
        --lang node \
        --label ${CC_NAME}_${NEW_VERSION}
fi

echo "✓ Package created: /tmp/${CC_NAME}_v${NEW_VERSION}.tar.gz"

# 3. Instructions for manual steps (approval requires orderer access)
cat <<'EOF'

====================================================
 MANUAL STEPS REQUIRED (run inside CLI container)
====================================================

# Install on peer:
peer lifecycle chaincode install /tmp/ehr_v2.0.tar.gz

# Get package ID:
peer lifecycle chaincode queryinstalled

# Set PACKAGE_ID from above output, then:
export PACKAGE_ID=<your_package_id>

# Approve for org:
peer lifecycle chaincode approveformyorg \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile /path/to/orderer/tls/ca.crt \
  --channelID mychannel \
  --name ehr \
  --version 2.0 \
  --sequence 2 \
  --package-id $PACKAGE_ID

# Commit:
peer lifecycle chaincode commit \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile /path/to/orderer/tls/ca.crt \
  --channelID mychannel \
  --name ehr \
  --version 2.0 \
  --sequence 2

====================================================
EOF
