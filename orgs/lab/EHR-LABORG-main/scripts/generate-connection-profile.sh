#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env

peer_pem_file="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/tlsca/tlsca.${LAB_ORG_DOMAIN}-cert.pem"
orderer_pem_file="${ROOT_DIR}/organizations/ordererOrganizations/${ORDERER_ORG_DOMAIN}/tlsca/tlsca.${ORDERER_ORG_DOMAIN}-cert.pem"

if [[ ! -f "${peer_pem_file}" || ! -f "${orderer_pem_file}" ]]; then
  echo "TLS CA certs are missing. Run ./scripts/generate-artifacts.sh first."
  exit 1
fi

peer_pem_json=$(awk 'NF {sub(/\r/, ""); printf "%s\\\\n",$0;}' "${peer_pem_file}")
orderer_pem_json=$(awk 'NF {sub(/\r/, ""); printf "%s\\\\n",$0;}' "${orderer_pem_file}")

mkdir -p "${ROOT_DIR}/connection-profiles"

sed \
  -e "s|\${PEERPEM}|${peer_pem_json}|g" \
  -e "s|\${ORDERERPEM}|${orderer_pem_json}|g" \
  "${ROOT_DIR}/templates/ccp-template.json" > "${ROOT_DIR}/connection-profiles/lab-connection.json"

{
  while IFS= read -r line; do
    if [[ "${line}" == *'${PEERPEM}'* ]]; then
      sed 's/^/        /' "${peer_pem_file}"
    elif [[ "${line}" == *'${ORDERERPEM}'* ]]; then
      sed 's/^/        /' "${orderer_pem_file}"
    else
      printf '%s\n' "${line}"
    fi
  done < "${ROOT_DIR}/templates/ccp-template.yaml"
} > "${ROOT_DIR}/connection-profiles/lab-connection.yaml"

echo "Wrote connection profiles to ${ROOT_DIR}/connection-profiles"
