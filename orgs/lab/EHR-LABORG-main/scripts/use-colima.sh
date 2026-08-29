#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_colima
wait_for_docker

echo "Docker context:"
docker context ls
echo
echo "Docker info:"
docker info --format 'Server={{.ServerVersion}} ContextOK'

