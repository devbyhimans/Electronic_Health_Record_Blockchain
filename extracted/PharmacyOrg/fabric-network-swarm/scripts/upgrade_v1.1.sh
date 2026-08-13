#!/bin/bash
# scripts/upgrade_v1.1.sh
# Automates the upgrade of ehr chaincode to v1.1 Sequence 2

set -euo pipefail

ROOT_DIR="/home/ankit/fabric-network/fabric-network-swarm"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051
export PATH=$PATH:/home/ankit/fabric-network/fabric-samples/bin

echo "▶ Packaging Chaincode v1.2..."
peer lifecycle chaincode package "$ROOT_DIR/ehr_v1.2.tar.gz" --path "$ROOT_DIR/chaincode/ehr" --lang node --label ehr_1.2

echo "▶ Installing Chaincode v1.2 on local peer..."
peer lifecycle chaincode install "$ROOT_DIR/ehr_v1.2.tar.gz"

echo "▶ Fetching Package ID..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "ehr_1.2" | head -n 1 | cut -d' ' -f 3 | cut -d',' -f 1)
echo "Package ID: $PACKAGE_ID"

echo "▶ Approving v1.2 Sequence 3..."
peer lifecycle chaincode approveformyorg -o localhost:7050 --channelID mychannel --name ehr --version 1.2 --package-id "$PACKAGE_ID" --sequence 3 --tls --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

echo "▶ Committing v1.2 Sequence 3..."
peer lifecycle chaincode commit -o localhost:7050 --channelID mychannel --name ehr --version 1.2 --sequence 3 --tls --cafile "$ROOT_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" --peerAddresses localhost:7051 --tlsRootCertFiles "$ROOT_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"

echo "✅ Chaincode Upgraded to v1.1 (Manager: Admin/Manager identities now authorized)"
