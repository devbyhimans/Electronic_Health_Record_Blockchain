# Fabric Artifacts And File Sync

This phase prepares crypto and channel artifacts for the isolated Swarm project.

## Step 1: Generate Or Copy Artifacts On PC1

Use this project, not the local one:

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
```

Required outputs:

- `crypto-config/`
- `channel-artifacts/genesis.block`
- `channel-artifacts/mychannel.tx`

If you regenerate them, make sure they match the three-peer layout.

## Step 2: Sync To Worker Machines

From PC1, copy the project into each user's home path first:

```bash
scp -r /home/ankit/fabric-network/fabric-network-swarm <PC2_USER>@<PC2_IP>:/home/<PC2_USER>/fabric-network/
scp -r /home/ankit/fabric-network/fabric-network-swarm <PC3_USER>@<PC3_IP>:/home/<PC3_USER>/fabric-network/
```

Then on each machine, point the common bind-mount path to the copied project:

```bash
sudo mkdir -p /srv
sudo ln -sfn /home/<USER>/fabric-network/fabric-network-swarm /srv/fabric-network-swarm
```

## Critical Rule

Worker nodes must have the files at the same absolute paths used by the stack files. Swarm volume mounts are resolved on the node where the task runs, so `/srv/fabric-network-swarm` must exist on all three machines.

## Exit Criteria

- PC1, PC2, and PC3 all have the same `crypto-config/`
- PC1, PC2, and PC3 all have the same `channel-artifacts/`
- all absolute paths in the compose files are valid on each machine
