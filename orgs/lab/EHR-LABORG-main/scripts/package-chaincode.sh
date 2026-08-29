#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env

cc_name="${1:-${CC_NAME}}"
cc_path="${2:-${ROOT_DIR}/${CC_SRC_PATH}}"
cc_label="${3:-${CC_LABEL}}"
cc_lang="${4:-${CC_LANGUAGE}}"

package_dir="${ROOT_DIR}/.generated/chaincode-packages"
package_file="${package_dir}/${cc_name}.tar.gz"
package_id_file="${package_dir}/${cc_name}.packageid"

if [[ ! -d "${cc_path}" ]]; then
  echo "Chaincode path not found: ${cc_path}"
  exit 1
fi

mkdir -p "${package_dir}"

peer lifecycle chaincode package "${package_file}" \
  --path "${cc_path}" \
  --lang "${cc_lang}" \
  --label "${cc_label}"

peer lifecycle chaincode calculatepackageid "${package_file}" > "${package_id_file}"

echo "Packaged chaincode:"
echo "- Package: ${package_file}"
echo "- Package ID: $(cat "${package_id_file}")"

