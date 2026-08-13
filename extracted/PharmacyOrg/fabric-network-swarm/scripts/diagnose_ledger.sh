#!/bin/bash
# diagnose_ledger.sh — Show detailed ledger status across all peers for presentation.

PC2_USER="rajput_mt"
PC2_IP="100.83.121.98"
PC3_USER="ronit"
PC3_IP="100.117.138.55"
CHANNEL="mychannel"

echo "================================================================="
echo "        MedBlock Distributed Ledger Diagnostic Report            "
echo "================================================================="
echo "Node: PC1 (Manager)"
P0=$(docker ps -q -f name=ehrswarm-peer0_peer0)
if [[ -n "$P0" ]]; then
    docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp "$P0" peer channel getinfo -c "$CHANNEL"
else
    echo "Peer0 is not running."
fi

echo -e "\n-----------------------------------------------------------------"
echo "Node: PC2 (Worker)"
ssh -o BatchMode=yes "$PC2_USER@$PC2_IP" "P1=\$(docker ps -q -f name=ehrswarm-peer1_peer1); if [[ -n \"\$P1\" ]]; then docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \"\$P1\" peer channel getinfo -c \"$CHANNEL\"; else echo \"Peer1 is not running.\"; fi"

echo -e "\n-----------------------------------------------------------------"
echo "Node: PC3 (Worker)"
ssh -o BatchMode=yes "$PC3_USER@$PC3_IP" "P2=\$(docker ps -q -f name=ehrswarm-peer2_peer2); if [[ -n \"\$P2\" ]]; then docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \"\$P2\" peer channel getinfo -c \"$CHANNEL\"; else echo \"Peer2 is not running.\"; fi"
echo "================================================================="

echo -e "\n[Optional] To see specific block details, run:"
echo "docker exec <PEER_ID> peer channel fetch newest -c $CHANNEL /tmp/block.pb && peer channel decode -f /tmp/block.pb"
