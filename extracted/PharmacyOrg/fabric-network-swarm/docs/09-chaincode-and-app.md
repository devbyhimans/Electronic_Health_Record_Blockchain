# Chaincode And App

Do this only after the channel exists and all peers have joined.

## Chaincode Strategy

Use the copied chaincode source under:

- `/home/ankit/fabric-network/fabric-network-swarm/chaincode/ehr`

Keep the Swarm deployment separate from the local chaincode service.

## Chaincode Lifecycle

High-level order:

1. package chaincode
2. install chaincode on peers
3. approve for org
4. check commit readiness
5. commit definition
6. verify with query or invoke

## Backend Setup

Files:

- `app/backend/app.js`
- `app/backend/connection.swarm.template.json`

Backend defaults for this project:

- port `4100`
- separate wallet path
- separate connection profile
- discovery enabled
- `asLocalhost=false`

Import identities into this project's wallet:

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
./scripts/import_wallet.sh
```

Start the app layer:

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
./scripts/start_app.sh
```

Stop it:

```bash
cd /home/ankit/fabric-network/fabric-network-swarm
./scripts/stop_app.sh
```

## Frontend Setup

Frontend default port is `5174` and points to backend `4100`.

## Exit Criteria

- chaincode query works from CLI
- backend health endpoint works
- frontend can call backend and query Fabric
