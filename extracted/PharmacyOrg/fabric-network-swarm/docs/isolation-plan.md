# Isolation Plan

This project is intentionally separated from the working local stack.

## What stays untouched

- `/home/ankit/fabric-network/start_all.sh`
- `/home/ankit/fabric-network/stop_all.sh`
- `/home/ankit/fabric-network/local_stack.sh`
- current local crypto material and running containers

## What is separated here

- backend default port: `4100`
- frontend default port: `5174`
- orderer host port on manager: `17050`
- peer0 host port on manager: `17051`
- CA host port on manager: `17054`
- overlay network name: `fabric-swarm-net`
- shared bind-mount path on every node: `/srv/fabric-network-swarm`
- stack prefix: `ehrswarm`

## Deployment notes

- keep Fabric internal service ports unchanged inside the overlay network
- only host-published manager ports are shifted to avoid collisions
- each worker must expose the project at `/srv/fabric-network-swarm`
- backend must use the Swarm connection profile, not the local one
- backend wallet must be created inside this project, not reused from the local project

## Next implementation steps

1. Copy or regenerate crypto material specifically for this Swarm project.
2. Copy channel artifacts into this project's `channel-artifacts/`.
3. Create the Swarm overlay network on the manager:
   - `docker network create --driver overlay --attachable fabric-swarm-net`
4. Label worker nodes:
   - `role=worker2`
   - `role=worker3`
5. Deploy orderer and peers using the stack files in `compose/`.
6. Update `app/backend/connection.swarm.template.json` if the manager host or ports change.
7. Import identities into `app/backend/wallet/` using this project's crypto material.
8. Start backend and frontend with this project's own env and runtime files.
