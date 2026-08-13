# Swarm Runbook Index

This runbook converts the earlier chat-based setup and recovery notes into a repeatable deployment guide for the isolated Swarm project.

Use this order:

1. `01-architecture-and-scope.md`
2. `02-machine-inventory.md`
3. `03-preflight-checklist.md`
4. `04-connect-friends-and-network.md`
5. `05-swarm-bootstrap.md`
6. `06-fabric-artifacts-and-file-sync.md`
7. `07-deploy-orderer-and-peers.md`
8. `08-channel-and-peer-join.md`
9. `09-chaincode-and-app.md`
10. `10-recovery-runbook.md`

Rules:

- do not change or stop the working local project during Swarm work
- do not skip verification steps between phases
- if one phase is unhealthy, fix it before moving forward
- keep exact machine usernames, Tailscale IPs, and node IDs written down

Primary references used for this runbook:

- prior chat workflow for Tailscale, Swarm, and Fabric recovery
- `fabric_distributed_setup.docx`
- the isolated project files under `fabric-network-swarm/`
