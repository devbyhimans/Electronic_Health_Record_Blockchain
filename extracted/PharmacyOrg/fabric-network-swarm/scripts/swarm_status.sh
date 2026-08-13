#!/bin/bash
set -euo pipefail

echo "=== Swarm Nodes ==="
docker node ls
echo

echo "=== Swarm Services ==="
docker service ls
echo

echo "=== Overlay Networks ==="
docker network ls | grep fabric || true
