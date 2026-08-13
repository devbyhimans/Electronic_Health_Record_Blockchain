# Deploy Orderer And Peers

Deploy one layer at a time and verify after each command.

## Step 1: Deploy CA On PC1

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
docker stack deploy -c compose/stack-ca.yaml ehrswarm-ca
docker service ls
```

Expected:

- CA service reaches `1/1`

## Step 2: Deploy Orderer On PC1

```bash
docker stack deploy -c compose/stack-orderer.yaml ehrswarm-orderer
docker service ls
```

Expected:

- orderer service reaches `1/1`

## Step 3: Deploy Peer0 On PC1

```bash
docker stack deploy -c compose/stack-peer0.yaml ehrswarm-peer0
docker service ls
```

Expected:

- `peer0` reaches `1/1`
- `couchdb0` reaches `1/1`

## Step 4: Deploy Peer1 Through Swarm

Run from PC1:

```bash
docker stack deploy -c compose/stack-peer1.yaml ehrswarm-peer1
docker service ls
```

Expected:

- `peer1` scheduled to the node labeled `worker2`
- `couchdb1` scheduled to the node labeled `worker2`

## Step 5: Deploy Peer2 Through Swarm

Run from PC1:

```bash
docker stack deploy -c compose/stack-peer2.yaml ehrswarm-peer2
docker service ls
```

Expected:

- `peer2` scheduled to the node labeled `worker3`
- `couchdb2` scheduled to the node labeled `worker3`

## Step 6: Investigate Any `0/1` Service Immediately

Useful commands:

```bash
docker service ls
docker service ps <SERVICE_NAME> --no-trunc
docker service logs <SERVICE_NAME> --follow
```

Common causes:

- missing worker label
- missing volume source path on that worker
- read-only filesystem on the worker
- existing port conflict on the manager

## Exit Criteria

- all orderer, peer, and couchdb services show `1/1`
