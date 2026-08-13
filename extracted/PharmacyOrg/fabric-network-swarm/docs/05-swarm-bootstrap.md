# Swarm Bootstrap

This phase restores or creates the Docker Swarm cluster.

## Step 1: Check Current Swarm State On PC1

```bash
docker node ls
```

If PC2 or PC3 show `Down`, rejoin them.

## Step 2: Rejoin Workers If Needed

On PC2 and PC3:

```bash
docker swarm leave
```

On PC1:

```bash
docker swarm join-token worker
```

Then on PC2 and PC3:

```bash
docker swarm join --token <TOKEN> <PC1_TAILSCALE_IP>:2377
```

## Step 3: Verify Nodes

On PC1:

```bash
docker node ls
```

Target state:

- PC1: `Ready`, `Leader`
- PC2: `Ready`
- PC3: `Ready`

## Step 4: Reapply Labels

Find node IDs:

```bash
docker node ls
```

Apply labels on PC1:

```bash
docker node update --label-add role=worker2 <PC2_NODE_ID>
docker node update --label-add role=worker3 <PC3_NODE_ID>
```

Optional manager label:

```bash
docker node update --label-add role=manager <PC1_NODE_ID>
```

## Step 5: Ensure Overlay Network Exists

On PC1:

```bash
docker network create --driver overlay --attachable fabric-swarm-net
```

If it already exists, inspect instead:

```bash
docker network ls | grep fabric-swarm-net
```

## Exit Criteria

- all nodes are `Ready`
- worker labels are present
- `fabric-swarm-net` exists
