#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env "env/machine1.env"
ensure_container_runtime
wait_for_docker
require_fabric_binaries
set_peer_cli_env
set_peer_context peer0

cc_sequence="${DEPLOY_CC_SEQUENCE:-${CC_SEQUENCE}}"
cc_endorsement_policy="${CC_ENDORSEMENT_POLICY:-}"

package_file="${ROOT_DIR}/.generated/chaincode-packages/${CC_NAME}.tar.gz"
package_id_file="${ROOT_DIR}/.generated/chaincode-packages/${CC_NAME}.packageid"
peer0_tls="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/peers/${PEER0_HOST}/tls/ca.crt"
orderer_ca="$(orderer_ca_file)"

"${ROOT_DIR}/scripts/package-chaincode.sh" "${CC_NAME}" "${ROOT_DIR}/${CC_SRC_PATH}" "${CC_LABEL}" "${CC_LANGUAGE}"
"${ROOT_DIR}/scripts/install-chaincode.sh" peer0 "${CC_NAME}"

package_id="$(cat "${package_id_file}")"
committed_output="$(peer lifecycle chaincode querycommitted --channelID "${CHANNEL_NAME}" --name "${CC_NAME}" 2>/dev/null || true)"

if grep -q "Version: ${CC_VERSION}, Sequence: ${cc_sequence}" <<<"${committed_output}"; then
  echo "${CC_NAME} is already committed on ${CHANNEL_NAME}"
else
  approve_cmd=(
    peer lifecycle chaincode approveformyorg
    -o "${ORDERER_HOST}:${ORDERER_PORT}"
    --ordererTLSHostnameOverride "${ORDERER_HOST}"
    --tls
    --cafile "${orderer_ca}"
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --package-id "${package_id}"
    --sequence "${cc_sequence}"
    --waitForEvent
  )
  if [[ -n "${cc_endorsement_policy}" ]]; then
    approve_cmd+=(--signature-policy "${cc_endorsement_policy}")
  fi
  "${approve_cmd[@]}"

  readiness_cmd=(
    peer lifecycle chaincode checkcommitreadiness
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --sequence "${cc_sequence}"
    --output json
  )
  if [[ -n "${cc_endorsement_policy}" ]]; then
    readiness_cmd+=(--signature-policy "${cc_endorsement_policy}")
  fi
  "${readiness_cmd[@]}"

  commit_cmd=(
    peer lifecycle chaincode commit
    -o "${ORDERER_HOST}:${ORDERER_PORT}" \
    --ordererTLSHostnameOverride "${ORDERER_HOST}"
    --tls
    --cafile "${orderer_ca}"
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --sequence "${cc_sequence}"
    --peerAddresses "${PEER0_HOST}:${PEER_PORT}"
    --tlsRootCertFiles "${peer0_tls}"
    --waitForEvent
  )
  if [[ -n "${cc_endorsement_policy}" ]]; then
    commit_cmd+=(--signature-policy "${cc_endorsement_policy}")
  fi
  "${commit_cmd[@]}"
fi

"${ROOT_DIR}/scripts/invoke-labresults.sh" InitLedger
"${ROOT_DIR}/scripts/query-labresults.sh" peer0 GetAllLabResults

echo
echo "Re-sync the repo to machines 2 and 3 so they receive:"
echo "- ${package_file}"
echo "- ${package_id_file}"

