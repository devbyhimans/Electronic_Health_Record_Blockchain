#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_SAMPLES_DIR="${ROOT_DIR}/.generated/fabric-samples"
FABRIC_BIN_DIR="${FABRIC_SAMPLES_DIR}/bin"
FABRIC_CONFIG_DIR="${FABRIC_SAMPLES_DIR}/config"

host_os() {
  uname -s
}

load_env() {
  local machine_env="${1:-}"
  set -a
  source "${ROOT_DIR}/env/network.env"
  if [[ -n "${machine_env}" ]]; then
    source "${ROOT_DIR}/${machine_env}"
  fi
  set +a
}

ensure_colima() {
  if ! colima status >/dev/null 2>&1; then
    colima start --cpu 4 --memory 8 --disk 60
  fi
  if docker context ls --format '{{.Name}} {{.Current}}' | awk '$2=="true"{print $1}' | grep -qx 'colima'; then
    return
  fi
  if docker context ls --format '{{.Name}}' | grep -qx 'colima'; then
    docker context use colima >/dev/null
  fi
}

ensure_linux_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. On Ubuntu run ./scripts/install-prereqs-ubuntu.sh or install Docker Engine manually."
    exit 1
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl is-active --quiet docker; then
      echo "Docker service is not running. Start it with: sudo systemctl enable --now docker"
      exit 1
    fi
  fi
}

ensure_container_runtime() {
  case "$(host_os)" in
    Darwin)
      ensure_colima
      ;;
    Linux)
      ensure_linux_docker
      ;;
    *)
      echo "Unsupported host OS: $(host_os)"
      exit 1
      ;;
  esac
}

require_fabric_binaries() {
  if [[ ! -x "${FABRIC_BIN_DIR}/cryptogen" || ! -x "${FABRIC_BIN_DIR}/configtxgen" || ! -x "${FABRIC_BIN_DIR}/peer" ]]; then
    echo "Fabric binaries are missing. Run ./scripts/download-fabric.sh first."
    exit 1
  fi
  export PATH="${FABRIC_BIN_DIR}:${PATH}"
}

set_configtx_env() {
  export FABRIC_CFG_PATH="${ROOT_DIR}/config"
}

set_peer_cli_env() {
  if [[ ! -f "${FABRIC_CONFIG_DIR}/core.yaml" ]]; then
    echo "Missing core.yaml at ${FABRIC_CONFIG_DIR}/core.yaml. Run ./scripts/download-fabric.sh first."
    exit 1
  fi
  export FABRIC_CFG_PATH="${FABRIC_CONFIG_DIR}"
}

compose_up() {
  local compose_file="$1"
  docker compose --project-name "${COMPOSE_PROJECT_NAME}" -f "${ROOT_DIR}/${compose_file}" up -d
}

compose_down() {
  local compose_file="$1"
  docker compose --project-name "${COMPOSE_PROJECT_NAME}" -f "${ROOT_DIR}/${compose_file}" down
}

set_peer_context() {
  local peer_name="$1"

  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="${LAB_MSP_ID}"
  export CORE_PEER_MSPCONFIGPATH="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/users/Admin@${LAB_ORG_DOMAIN}/msp"

  case "${peer_name}" in
    peer0)
      export CORE_PEER_ADDRESS="${PEER0_HOST}:${PEER_PORT}"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/peers/${PEER0_HOST}/tls/ca.crt"
      ;;
    peer1)
      export CORE_PEER_ADDRESS="${PEER1_HOST}:${PEER_PORT}"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/peers/${PEER1_HOST}/tls/ca.crt"
      ;;
    peer2)
      export CORE_PEER_ADDRESS="${PEER2_HOST}:${PEER_PORT}"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/peers/${PEER2_HOST}/tls/ca.crt"
      ;;
    *)
      echo "Unknown peer name: ${peer_name}"
      exit 1
      ;;
  esac
}

orderer_ca_file() {
  echo "${ROOT_DIR}/organizations/ordererOrganizations/${ORDERER_ORG_DOMAIN}/orderers/${ORDERER_HOST}/tls/ca.crt"
}

wait_for_docker() {
  local tries=30
  local delay=2
  local i
  for ((i=1; i<=tries; i++)); do
    if docker info >/dev/null 2>&1; then
      return
    fi
    sleep "${delay}"
  done
  echo "Docker is not responding after waiting."
  exit 1
}
