#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PC2_USER="${PC2_USER:-rajput_mt}"
PC2_IP="${PC2_IP:-100.83.121.98}"
PC3_USER="${PC3_USER:-ronit}"
PC3_IP="${PC3_IP:-100.117.138.55}"

echo "Preparing remote directories..."
ssh "${PC2_USER}@${PC2_IP}" "mkdir -p /home/${PC2_USER}/fabric-network"
ssh "${PC3_USER}@${PC3_IP}" "mkdir -p /home/${PC3_USER}/fabric-network"

echo "Copying project to PC2..."
scp -r "$ROOT_DIR" "${PC2_USER}@${PC2_IP}:/home/${PC2_USER}/fabric-network/"

echo "Copying project to PC3..."
scp -r "$ROOT_DIR" "${PC3_USER}@${PC3_IP}:/home/${PC3_USER}/fabric-network/"

echo "Project copy complete."
echo "Next, create the common mount path on each machine:"
echo "  sudo mkdir -p /srv"
echo "  sudo ln -sfn /home/<user>/fabric-network/fabric-network-swarm /srv/fabric-network-swarm"
