#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
ensure_container_runtime
wait_for_docker

mkdir -p "${ROOT_DIR}/.generated"
cd "${ROOT_DIR}/.generated"

if [[ ! -f install-fabric.sh ]]; then
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
fi

./install-fabric.sh --fabric-version "${FABRIC_VERSION}" --ca-version "${FABRIC_CA_VERSION}" binary docker samples

echo "Fabric binaries available at ${FABRIC_BIN_DIR}"
