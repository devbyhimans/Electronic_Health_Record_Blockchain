# Hospital backend services

This folder contains the hospital-facing Fabric APIs, IPFS bridge, and optional Group 1 dashboard API. The root workspace uses Docker Compose and the ports below; this is distinct from old standalone deployment notes that may use historical internal port values.

## Services

| Service | Host port | Main responsibility |
|---|---:|---|
| `peer0-api` | `4001` | Reception/admin routes and hospital staff login. |
| `peer1-api` | `4002` | Doctor workflow routes. |
| `peer2-api` | `4003` | Nurse, pharmacist, and medical-record routes. |
| `extorg-api` | `4004` | Diagnostics/provider routes. |
| `patient-api` | `4005` | Patient portal API. |
| `ipfs-service` | `4006` | Authenticated IPFS bridge routes. |
| `dashboard-api` | `4010` | Optional read-only observability API; opt-in profile. |

The three hospital peer APIs receive `VITE_*_API_TARGET` values in Compose so their Vite proxies use Docker service names from inside the container. Requests from the browser should use the Nginx paths such as `/api/hospital/peer0/auth/login` or the portal's Vite proxy in development.

## Fabric and data

The hospital APIs connect using the existing network configuration and wallets. Root `./start.sh` verifies that existing CA/identity material is present, starts the configured CA and peer/orderer Compose files, and does not reenroll identities, reset ledger state, create the channel, or deploy chaincode. Follow the network-specific first-time setup only when the owning team approves it.

The dashboard is a separate, read-only module. It does not share or read other services' `.env` files. Its observer identity and JWT verification keys must be supplied in the dashboard's own local environment; see [`dashboard-api/README.md`](dashboard-api/README.md).

## Chaincode

The Fabric package exports eight contracts: `PatientContract`, `VisitContract`, `ForwardContract`, `ClinicalContract`, `LabContract`, `ClaimsContract`, `EhrContract`, and `AccessContract`. The source in `ehr-chaincode-v3/lib/` is authoritative for available transactions. See the [chaincode README](../ehr-chaincode-v3/README.md); the separate specification should not be taken as proof that every proposed flow is deployed.

## Local run

Use the repository root:

```bash
./start.sh
```

Use `./stop.sh` to stop services without deleting Docker volumes. See the [root README](../../../../README.md) for routes, limitations, and service status distinctions. Do not place credentials or patient data in this repository or chat.
