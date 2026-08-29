#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: ./scripts/install-chaincode.sh peer0|peer1|peer2 [chaincode_name]"
  exit 1
fi

peer_name="$1"
cc_name="${2:-labresults}"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env
set_peer_context "${peer_name}"

package_file="${ROOT_DIR}/.generated/chaincode-packages/${cc_name}.tar.gz"
package_id_file="${ROOT_DIR}/.generated/chaincode-packages/${cc_name}.packageid"

if [[ ! -f "${package_file}" || ! -f "${package_id_file}" ]]; then
  echo "Missing packaged chaincode. Run ./scripts/package-chaincode.sh on machine 1 and sync the repo again."
  exit 1
fi

package_id="$(cat "${package_id_file}")"
installed_output="$(peer lifecycle chaincode queryinstalled)"

if grep -q "${package_id}" <<<"${installed_output}"; then
  echo "${cc_name} is already installed on ${peer_name}"
else
  peer lifecycle chaincode install "${package_file}"
fi

echo
echo "Installed packages on ${peer_name}:"
peer lifecycle chaincode queryinstalled

