#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/app/backend"

cd "$BACKEND_DIR"
rm -rf wallet
CRYPTO_CONFIG_ROOT="$ROOT_DIR/crypto-config" \
FABRIC_WALLET_PATH="$BACKEND_DIR/wallet" \
node import_identities.js
