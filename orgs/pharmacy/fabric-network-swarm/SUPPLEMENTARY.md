# Pharmacy standalone requirements (legacy reference)

This document describes requirements for the pharmacy folder's separate Swarm deployment materials. It is not the root workspace's current deployment topology. For the current local status, ports, startup behavior, and Fabric integration gap see this folder's [README](README.md) and the root [README](../../../README.md).

Root `./start.sh` runs the pharmacy backend and source-backed UIs as individual Compose services. It does not start a pharmacy-specific Fabric network or deploy pharmacy chaincode. The patient UI is skipped because its `src` directory is absent. Do not use old fixed IPs, machine allocations, or port assumptions below as proof of a live deployment.

Any standalone network deployment must be coordinated with the Pharmacy and Blockchain teams, use locally supplied credentials, and be kept isolated from the shared root ledger unless the topology is explicitly reconciled.
