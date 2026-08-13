#!/bin/bash
set -euo pipefail

USER_NAME="${1:-$USER}"
TARGET="/home/${USER_NAME}/fabric-network/fabric-network-swarm"

if [[ ! -d "$TARGET" ]]; then
  echo "Project path not found: $TARGET"
  exit 1
fi

sudo mkdir -p /srv
sudo ln -sfn "$TARGET" /srv/fabric-network-swarm

echo "Linked /srv/fabric-network-swarm -> $TARGET"
