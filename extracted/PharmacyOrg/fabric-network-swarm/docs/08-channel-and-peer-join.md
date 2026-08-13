# Channel And Peer Join

Only start this phase after all peer and orderer services are healthy.

## Important Note

For channel operations, use an admin MSP path. Do not use a peer MSP path by mistake.

## Step 1: Create The Channel From Peer0 Context

The exact command depends on how you expose the admin material inside the container or CLI helper. The earlier flow used `peer0` directly.

Set the environment:

```bash
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
```

Create the channel:

```bash
peer channel create \
  -o orderer.example.com:7050 \
  -c mychannel \
  -f /etc/hyperledger/fabric/channel-artifacts/mychannel.tx \
  --outputBlock mychannel.block \
  --tls \
  --cafile /etc/hyperledger/fabric/tls/ca.crt
```

## Step 2: Join Peer0

```bash
peer channel join -b mychannel.block
```

## Step 3: Copy The Block To Workers

Send `mychannel.block` to PC2 and PC3 using SCP if needed by your join method.

## Step 4: Join Peer1 And Peer2

On each worker, use the peer context for that node and join with the channel block.

## Verification

Check logs after each join attempt.

If a join fails:

- verify the block file exists
- verify TLS CA path
- verify admin MSP path
- verify orderer reachability from the peer

## Exit Criteria

- peer0 joined `mychannel`
- peer1 joined `mychannel`
- peer2 joined `mychannel`
