#!/bin/bash
# deploy_fix.sh — Automated hot-fix deployment for MedBlock Swarm
set -euo pipefail

ROOT_DIR="/home/ankit/fabric-network/fabric-network-swarm"
PC2_USER="rajput_mt"
PC2_IP="100.83.121.98"
PC3_USER="ronit"
PC3_IP="100.117.138.55"

VERSION="2.1"
SEQUENCE="2"
LABEL="ehr_2.1"
CHANNEL="mychannel"

export PATH=$PATH:/home/ankit/fabric-network/fabric-samples/bin
export FABRIC_CFG_PATH=/home/ankit/fabric-network/fabric-samples/config
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_ADDRESS=localhost:7051

echo "1. Packaging chaincode $LABEL..."
peer lifecycle chaincode package "$ROOT_DIR/ehr_fix.tar.gz" --path "$ROOT_DIR/chaincode/ehr" --lang node --label "$LABEL"

echo "2. Installing on Peer0 (PC1)..."
peer lifecycle chaincode install "$ROOT_DIR/ehr_fix.tar.gz" || echo "  ✅ already installed on peer0"

echo "3. Syncing and Installing on Worker Nodes..."
for PC in "$PC2_IP" "$PC3_IP"; do
    U="rajput_mt"; P="peer1"; if [ "$PC" == "$PC3_IP" ]; then U="ronit"; P="peer2"; fi
    echo "  -> Syncing to $P ($PC)..."
    scp -o BatchMode=yes "$ROOT_DIR/ehr_fix.tar.gz" "$U@$PC:/home/$U/fabric-network/fabric-network-swarm/ehr_fix.tar.gz"
    
    echo "  -> Injecting and Installing on $P..."
    CID=$(ssh -o BatchMode=yes "$U@$PC" "docker ps -q -f name=$P | head -1")
    if [[ -z "$CID" ]]; then echo "  ⚠️  Container $P not found on $PC"; continue; fi
    
    ssh -o BatchMode=yes "$U@$PC" "docker cp /home/$U/fabric-network/fabric-network-swarm/ehr_fix.tar.gz $CID:/tmp/ehr_fix.tar.gz"
    ssh -o BatchMode=yes "$U@$PC" "docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp $CID peer lifecycle chaincode install /tmp/ehr_fix.tar.gz" || echo "  ✅ already installed on $P"
done

echo "4. Approving and Committing..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "$LABEL" | cut -d' ' -f3 | tr -d ',')
echo "Package ID: $PACKAGE_ID"

peer lifecycle chaincode approveformyorg -o localhost:7050 --channelID "$CHANNEL" --name ehr --version "$VERSION" \
    --package-id "$PACKAGE_ID" --sequence "$SEQUENCE" --tls \
    --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

peer lifecycle chaincode commit -o localhost:7050 --channelID "$CHANNEL" --name ehr --version "$VERSION" --sequence "$SEQUENCE" \
    --tls --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"

echo "✓ Chaincode upgraded to $VERSION Sequence $SEQUENCE"
