# Recovery Runbook

Use this when hotspot changes, Tailscale disconnects, workers go `Down`, or services fall back to `0/1`.

## Recovery Order

1. restore network connectivity
2. restore Tailscale
3. restore SSH access
4. restore Swarm membership
5. restore labels
6. restore overlay network
7. redeploy services
8. verify services
9. only then retry channel or chaincode actions if required

## Step 1: Restore Connectivity

On all machines:

```bash
sudo tailscale up
tailscale ip -4
sudo ufw allow in on tailscale0
```

From PC1:

```bash
ssh <PC2_USER>@<PC2_IP>
ssh <PC3_USER>@<PC3_IP>
```

## Step 2: Restore Swarm

On PC1:

```bash
docker node ls
```

If a worker is `Down`, on that worker:

```bash
docker swarm leave
```

Then on PC1:

```bash
docker swarm join-token worker
```

Run the join command on the affected worker.

## Step 3: Restore Labels

On PC1:

```bash
docker node update --label-add role=worker2 <PC2_NODE_ID>
docker node update --label-add role=worker3 <PC3_NODE_ID>
```

## Step 4: Restore Overlay Network

On PC1:

```bash
docker network ls | grep fabric-swarm-net
docker network create --driver overlay --attachable --opt com.docker.network.driver.mtu=1200 fabric-swarm-net
```

## Step 5: Redeploy Services

On PC1:

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
docker stack deploy -c compose/stack-ca.yaml ehrswarm-ca
docker stack deploy -c compose/stack-orderer.yaml ehrswarm-orderer
docker stack deploy -c compose/stack-peer0.yaml ehrswarm-peer0
docker stack deploy -c compose/stack-peer1.yaml ehrswarm-peer1
docker stack deploy -c compose/stack-peer2.yaml ehrswarm-peer2
docker service ls
```

## Step 6: Validate Service Health

Target state:

- every expected service is `1/1`

If not:

```bash
docker service ps <SERVICE_NAME> --no-trunc
docker service logs <SERVICE_NAME> --follow
```

## Step 7: Channel Recovery Decision

If peer data volumes survived, peers may still remember channel membership.

If volumes were lost:

- recreate or redistribute `mychannel.block`
- rejoin affected peers

## Common Failures

- worker label missing
- read-only filesystem on a worker
- missing volume source path on a worker
- Tailscale IP changed and workers rejoined with stale manager IP
- worker not actually reachable by SSH or Swarm traffic
- **Missing Persistent Volume for Orderer**: Ensure `stack-orderer.yaml` has a volume mount for `/var/hyperledger/production` to avoid losing channel state on restart.
- **Overlay MTU Mismatch**: Default MTU 1500 is too large for Tailscale (1280). Use MTU 1200 for overlay networks.
