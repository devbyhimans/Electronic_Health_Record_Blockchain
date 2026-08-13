#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/app/backend"
MANAGER_DIR="$ROOT_DIR/app/manager"
EMPLOYEE_DIR="$ROOT_DIR/app/employee"
INVENTORY_DIR="$ROOT_DIR/app/inventory"
PATIENT_DIR="$ROOT_DIR/app/patient"
RUNTIME_DIR="$ROOT_DIR/runtime"

# ── Fixed IPs ──────────────────────────────────────────────────────────────────
PC1_IP="100.124.176.94"

# ── Ports ──────────────────────────────────────────────────────────────────────
BACKEND_PORT=3000
MANAGER_PORT=3001
EMPLOYEE_PORT=3002
INVENTORY_PORT=3003
PATIENT_PORT=3004

# IPFS API
IPFS_API="http://127.0.0.1:5001/api/v0"
IPFS_GATEWAY_URL="http://${PC1_IP}:8080/ipfs"

mkdir -p "$RUNTIME_DIR"

# ── Helpers ────────────────────────────────────────────────────────────────────
kill_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

# Kill old ports
for PORT in $BACKEND_PORT $MANAGER_PORT $EMPLOYEE_PORT $INVENTORY_PORT $PATIENT_PORT; do
  sudo fuser -k "${PORT}/tcp" 2>/dev/null || true
done

# ── Backend ────────────────────────────────────────────────────────────────────
echo "▶ Starting Backend on ${PC1_IP}:${BACKEND_PORT} …"
cd "$BACKEND_DIR"
kill_pid_file "$RUNTIME_DIR/backend.pid"
PORT="$BACKEND_PORT" \
HOST="0.0.0.0" \
setsid npm start </dev/null > "$RUNTIME_DIR/backend.log" 2>&1 &
echo $! > "$RUNTIME_DIR/backend.pid"

# ── Manager Dashboard (3001) ───────────────────────────────────────────────────
echo "▶ Starting Manager UI  on ${PC1_IP}:${MANAGER_PORT} …"
cd "$MANAGER_DIR"
kill_pid_file "$RUNTIME_DIR/manager.pid"
VITE_API_URL="http://${PC1_IP}:${BACKEND_PORT}" \
setsid npm run dev -- --host 0.0.0.0 --port "$MANAGER_PORT" </dev/null > "$RUNTIME_DIR/manager.log" 2>&1 &
echo $! > "$RUNTIME_DIR/manager.pid"

# ── Employee Dashboard (3002) ──────────────────────────────────────────────────
echo "▶ Starting Employee (Pharmacist) UI on ${PC1_IP}:${EMPLOYEE_PORT} …"
if [ -d "$EMPLOYEE_DIR" ]; then
    cd "$EMPLOYEE_DIR"
    kill_pid_file "$RUNTIME_DIR/employee.pid"
    VITE_API_URL="http://${PC1_IP}:${BACKEND_PORT}" \
    setsid npm run dev -- --host 0.0.0.0 --port "$EMPLOYEE_PORT" </dev/null > "$RUNTIME_DIR/employee.log" 2>&1 &
    echo $! > "$RUNTIME_DIR/employee.pid"
fi

# ── Inventory Dashboard (3003) ─────────────────────────────────────────────────
echo "▶ Starting Inventory UI  on ${PC1_IP}:${INVENTORY_PORT} …"
if [ -d "$INVENTORY_DIR" ]; then
    cd "$INVENTORY_DIR"
    kill_pid_file "$RUNTIME_DIR/inventory.pid"
    VITE_API_URL="http://${PC1_IP}:${BACKEND_PORT}" \
    setsid npm run dev -- --host 0.0.0.0 --port "$INVENTORY_PORT" </dev/null > "$RUNTIME_DIR/inventory.log" 2>&1 &
    echo $! > "$RUNTIME_DIR/inventory.pid"
fi

# ── Patient Dashboard (3004) ───────────────────────────────────────────────────
echo "▶ Starting Patient UI  on ${PC1_IP}:${PATIENT_PORT} …"
if [ -d "$PATIENT_DIR" ]; then
    cd "$PATIENT_DIR"
    kill_pid_file "$RUNTIME_DIR/patient.pid"
    VITE_API_URL="http://${PC1_IP}:${BACKEND_PORT}" \
    setsid npm run dev -- --host 0.0.0.0 --port "$PATIENT_PORT" </dev/null > "$RUNTIME_DIR/patient.log" 2>&1 &
    echo $! > "$RUNTIME_DIR/patient.pid"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         MedBlock Swarm v2.0 — Digital Health Hub             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Backend API    → http://%-36s║\n" "${PC1_IP}:${BACKEND_PORT}"
printf "║  Manager  UI    → http://%-36s║\n" "${PC1_IP}:${MANAGER_PORT}"
printf "║  Employee UI    → http://%-36s║\n" "${PC1_IP}:${EMPLOYEE_PORT}"
printf "║  Inventory UI   → http://%-36s║\n" "${PC1_IP}:${INVENTORY_PORT}"
printf "║  Patient   UI   → http://%-36s║\n" "${PC1_IP}:${PATIENT_PORT}"
printf "║  IPFS Gateway   → http://%-36s║\n" "${PC1_IP}:8080/ipfs"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Logs: $RUNTIME_DIR/{backend,manager,employee,inventory,patient}.log"
