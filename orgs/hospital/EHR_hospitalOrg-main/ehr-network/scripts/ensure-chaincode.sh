#!/usr/bin/env bash
# ensure-chaincode.sh — make sure the `ehr` chaincode committed on the channel
# matches the source in ehr-chaincode-v3. Deploys (first time) or upgrades
# (next sequence) only when needed. Called by the root start.sh.
#
#   bash scripts/ensure-chaincode.sh [--channel ehrchannel] [--name ehr] [--force]
set -euo pipefail

CHANNEL="ehrchannel"; CC_NAME="ehr"; FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel) CHANNEL="$2"; shift ;;
    --name)    CC_NAME="$2"; shift ;;
    --force)   FORCE=true ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CC_SRC="$(cd "${BASE_DIR}/../ehr-chaincode-v3" && pwd)"
STATE_DIR="${BASE_DIR}/.generated"
STATE_FILE="${STATE_DIR}/${CHANNEL}-${CC_NAME}-chaincode.sha256"
if [[ "${CHANNEL}" == "ehrchannel" && ! -f "${STATE_FILE}" && -f "${STATE_DIR}/${CC_NAME}-chaincode.sha256" ]]; then
  STATE_FILE="${STATE_DIR}/${CC_NAME}-chaincode.sha256"
fi
ORGS="${BASE_DIR}/organizations"

source "${SCRIPT_DIR}/fabric-bin.sh"
command -v peer >/dev/null 2>&1 || { echo "[chaincode] peer binary not found (expected in <repo>/bin)" >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "[chaincode] jq is required" >&2; exit 1; }

export FABRIC_CFG_PATH="${BASE_DIR}/configtx"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="HospitalMSP"
export CORE_PEER_ADDRESS="localhost:7051"
export CORE_PEER_TLS_ROOTCERT_FILE="${ORGS}/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${ORGS}/peerOrganizations/hospital.example.com/users/hospitaladmin/msp"

# Hash of everything that goes into the chaincode package.
src_hash() {
  ( cd "${CC_SRC}" && find index.js package.json lib -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1 )
}

# Prints the committed sequence, or 0 when the chaincode is not committed.
# Retries while the peer is still starting.
committed_sequence() {
  local out attempt
  for attempt in $(seq 1 20); do
    if out="$(peer lifecycle chaincode querycommitted -C "${CHANNEL}" -n "${CC_NAME}" --output json 2>&1)"; then
      echo "${out}" | jq -r '.sequence'
      return 0
    fi
    if echo "${out}" | grep -qiE 'not found|not defined|404'; then
      echo 0
      return 0
    fi
    sleep 3
  done
  echo "[chaincode] peer0.hospital did not answer querycommitted: ${out}" >&2
  return 1
}

WANT="$(src_hash)"
SEQ="$(committed_sequence)"
HAVE="$(cat "${STATE_FILE}" 2>/dev/null || true)"

if [[ "${SEQ}" != "0" && "${HAVE}" == "${WANT}" && "${FORCE}" == false ]]; then
  echo "[chaincode] ${CC_NAME} is committed at sequence ${SEQ} on ${CHANNEL} and matches the source. Nothing to do."
  exit 0
fi

NEXT=$((SEQ + 1))
VERSION="${NEXT}.${WANT:0:8}"
if [[ "${SEQ}" == "0" ]]; then
  echo "[chaincode] ${CC_NAME} is not committed on ${CHANNEL}. Deploying sequence ${NEXT} (version ${VERSION})."
else
  echo "[chaincode] ${CC_NAME} source differs from what this machine last deployed. Upgrading ${SEQ} -> ${NEXT} (version ${VERSION})."
fi

( cd "${BASE_DIR}" && bash scripts/deployChaincode.sh \
    --channel "${CHANNEL}" --chaincode-name "${CC_NAME}" \
    --chaincode-path "${CC_SRC}" --version "${VERSION}" --sequence "${NEXT}" )

NOW="$(committed_sequence)"
if [[ "${NOW}" != "${NEXT}" ]]; then
  echo "[chaincode] deploy finished but the channel reports sequence ${NOW}, expected ${NEXT}." >&2
  exit 1
fi
mkdir -p "${STATE_DIR}"
echo "${WANT}" > "${STATE_FILE}"
echo "[chaincode] ${CC_NAME} committed on ${CHANNEL} at sequence ${NEXT}."
