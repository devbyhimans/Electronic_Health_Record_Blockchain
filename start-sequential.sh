#!/usr/bin/env bash
# ==============================================================================
# start-sequential.sh — Linux Startup Script for EHR Multi-Org Services
# Replaces Windows-only start-sequential.ps1
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/logs"
PID_DIR="${ROOT_DIR}/.pids"

mkdir -p "${LOG_DIR}" "${PID_DIR}"

declare -A SERVICES
# Hospital Backends
SERVICES["ipfs-service"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/ipfs-service:npm start:4006"
SERVICES["peer0-api"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer0-api:npm start:4001"
SERVICES["peer1-api"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer1-api:npm start:4002"
SERVICES["peer2-api"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer2-api:npm start:4003"
SERVICES["extorg-api"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/extorg-api:npm start:4004"
SERVICES["patient-api"]="orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/patient-api:npm start:4005"

# Hospital Frontends
SERVICES["hospital-portal"]="orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/hospital-portal:npx vite --host 0.0.0.0 --port 5173:5173"
SERVICES["patient-portal"]="orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/patient-portal:npx vite --host 0.0.0.0 --port 5174:5174"

# Pharmacy Apps
SERVICES["pharmacy-manager"]="orgs/pharmacy/fabric-network-swarm/app/manager:npm run dev -- --host 0.0.0.0 --port 3001:3001"
SERVICES["pharmacy-employee"]="orgs/pharmacy/fabric-network-swarm/app/employee:npm run dev -- --host 0.0.0.0 --port 3002:3002"
SERVICES["pharmacy-inventory"]="orgs/pharmacy/fabric-network-swarm/app/inventory:npm run dev -- --host 0.0.0.0 --port 3003:3003"
SERVICES["pharmacy-patient"]="orgs/pharmacy/fabric-network-swarm/app/patient:npm run dev -- --host 0.0.0.0 --port 3004:3004"
SERVICES["pharmacy-billing"]="orgs/pharmacy/fabric-network-swarm/app/billing:npm run dev -- --host 0.0.0.0 --port 3005:3005"
SERVICES["pharmacy-frontend"]="orgs/pharmacy/fabric-network-swarm/app/frontend:npm run dev -- --host 0.0.0.0 --port 5175:5175"

# Lab
SERVICES["lab-gateway"]="orgs/lab/EHR-LABORG-main/client/node-gateway:env PORT=8080 node server.js:8080"

install_all() {
    echo "======================================================="
    echo "Installing dependencies for all services..."
    echo "======================================================="
    for name in "${!SERVICES[@]}"; do
        IFS=":" read -r rel_dir cmd port <<< "${SERVICES[$name]}"
        target_dir="${ROOT_DIR}/${rel_dir}"
        if [ -d "${target_dir}" ]; then
            echo "[*] Installing in ${rel_dir}..."
            (cd "${target_dir}" && rm -f package-lock.json && npm install)
        else
            echo "[!] Skipping ${rel_dir} (directory not found)"
        fi
    done
    echo "All dependencies installed."
}

start_all() {
    echo "======================================================="
    echo "Starting all services in background..."
    echo "======================================================="
    for name in "${!SERVICES[@]}"; do
        IFS=":" read -r rel_dir cmd port <<< "${SERVICES[$name]}"
        target_dir="${ROOT_DIR}/${rel_dir}"
        log_file="${LOG_DIR}/${name}.log"
        pid_file="${PID_DIR}/${name}.pid"

        if [ -d "${target_dir}" ]; then
            if [ -f "${pid_file}" ] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
                echo "[-] ${name} is already running (PID: $(cat "${pid_file}"))"
                continue
            fi
            echo "[+] Starting ${name} in ${rel_dir} (Port: ${port:-N/A})..."
            (
                cd "${target_dir}"
                nohup ${cmd} > "${log_file}" 2>&1 &
                echo $! > "${pid_file}"
            )
            echo "    Started with PID $(cat "${pid_file}"), logging to ${log_file}"
        fi
    done
}

stop_all() {
    echo "======================================================="
    echo "Stopping all running services..."
    echo "======================================================="
    for pid_file in "${PID_DIR}"/*.pid; do
        if [ -f "${pid_file}" ]; then
            name="$(basename "${pid_file}" .pid)"
            pid="$(cat "${pid_file}")"
            if kill -0 "${pid}" 2>/dev/null; then
                echo "[-] Stopping ${name} (PID: ${pid})..."
                kill "${pid}" 2>/dev/null || true
            fi
            rm -f "${pid_file}"
        fi
    done

    # Terminate any remaining processes on project ports (handles orphaned child processes)
    for port in 4001 4002 4003 4004 4005 4006 5173 5174 5175 8080; do
        pids=$(lsof -ti :${port} 2>/dev/null || true)
        if [ -n "${pids}" ]; then
            echo "[-] Freeing port :${port} (PIDs: ${pids})..."
            kill -9 ${pids} 2>/dev/null || true
        fi
    done
    echo "All services stopped and ports freed."
}

status_all() {
    echo "======================================================="
    echo "Service Status:"
    echo "======================================================="
    printf "%-25s %-10s %-10s\n" "SERVICE" "STATUS" "PID"
    printf "%-25s %-10s %-10s\n" "-------------------------" "----------" "----------"
    for name in "${!SERVICES[@]}"; do
        pid_file="${PID_DIR}/${name}.pid"
        if [ -f "${pid_file}" ] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
            printf "%-25s %-10s %-10s\n" "${name}" "RUNNING" "$(cat "${pid_file}")"
        else
            printf "%-25s %-10s %-10s\n" "${name}" "STOPPED" "-"
        fi
    done
}

case "${1:-start}" in
    install)
        install_all
        ;;
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_all
        ;;
    status)
        status_all
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status}"
        exit 1
        ;;
esac
