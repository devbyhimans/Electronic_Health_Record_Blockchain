#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_linux_docker
wait_for_docker

echo "Docker info:"
docker info --format 'Server={{.ServerVersion}}'
echo
echo "Docker compose:"
docker compose version

