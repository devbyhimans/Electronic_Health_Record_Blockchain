# MedBlock Swarm: Deployment & Recovery Guide

This document provides detailed instructions for deploying, maintaining, and recovering the MedBlock v2 distributed infrastructure.

## 1. Network Prerequisites (All Nodes)

Before deploying, ensure all three nodes (PC1, PC2, PC3) are configured to communicate over the Tailscale mesh network.

### 1.1 Firewall (UFW)
Run this on all nodes to allow the Docker Swarm data plane to communicate securely over Tailscale:
```bash
sudo ufw allow in on tailscale0
```

### 1.2 Overay Network MTU
Tailscale has an MTU of 1280. Docker's default MTU (1500) will cause packet loss. 
The system uses a custom network `fabric-swarm-net` with **MTU 1200**. 

If you ever need to recreate it manually:
```bash
docker network create --driver overlay --attachable --opt com.docker.network.driver.mtu=1200 fabric-swarm-net
```

---

## 2. Infrastructure Setup

### 2.1 Swarm Initiation
- **PC1 (Manager)**: `docker swarm init --advertise-addr <PC1_TAILSCALE_IP>`
- **PC2 (Worker)**: `docker swarm join --token <TOKEN> <PC1_TAILSCALE_IP>:2377 --advertise-addr <PC2_TAILSCALE_IP>`
- **PC3 (Worker)**: `docker swarm join --token <TOKEN> <PC1_TAILSCALE_IP>:2377 --advertise-addr <PC3_TAILSCALE_IP>`

### 2.2 Node Labels
Assign roles to the workers so the peers land on the correct machines:
```bash
docker node update --label-add role=worker ankit-pc2  # Example name
docker node update --label-add role=worker ankit-pc3  # Example name
```

---

## 3. One-Click Deployment

Everything is automated via the `deploy.sh` script on **PC1**.

### Fresh Deployment (Wipe Data)
```bash
bash deploy.sh
```

### Restart Apps Only (Keep Ledger)
```bash
bash deploy.sh --apps-only
```

### Update Chaincode
If you modify the smart contract in `chaincode/ehr/`, you must update `deploy.sh` with a new `CC_VERSION` and increment `CC_SEQUENCE` before running the deployment.

---

## 4. Recovery Scenarios

### Scenario A: Node Disconnection
If a worker node (PC2 or PC3) gets disconnected:
1. Ensure Tailscale is up: `tailscale status`.
2. Check if the node is "Ready" in Swarm: `docker node ls`.
3. If it shows "Down", check the firewall on both manager and worker.
4. Once the node rejoins, the Peer container will restart automatically.
5. Run `bash scripts/verify_sync.sh` to check if it's pulling blocks.

### Scenario B: Ledger Sync Stuck (Height 1)
If a peer is stuck at Height 1 but Peer0 is higher:
1. This is usually an MTU or Firewall issue.
2. Verify connectivity: `docker exec <PEER_ID> cat < /dev/tcp/orderer.example.com/7050`.
3. If it fails, run the UFW command (`sudo ufw allow in on tailscale0`) on all nodes.
4. Ensure the network MTU is 1200: `docker network inspect fabric-swarm-net`.

### Scenario C: "Access Denied" in Patient Portal
1. This usually indicates an identity resolution issue in the chaincode.
2. Ensure you are running chaincode **v2.1** or higher.
3. Check version with: `bash scripts/diagnose_ledger.sh`.

---

## 5. Maintenance Tools
- `bash scripts/diagnose_ledger.sh`: Show height and sync status across all nodes.
- `bash scripts/verify_sync.sh`: Quick check for ledger matching.
- `bash scripts/seed_dummy_data.sh`: Populate the network with test data.
