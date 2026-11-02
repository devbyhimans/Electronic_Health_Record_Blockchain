# System overview

This is a local academic/demo workspace for a permissioned EHR built around Hyperledger Fabric. It combines hospital, patient, lab, pharmacy, IPFS, and observability code while preserving them as separate services. Some screens and APIs are runnable without their external dependencies; that does not mean they are connected to a live ledger.

## Current components

- **Fabric:** the root workspace uses `ehrchannel` with `HospitalMSP`, `DiagnosticsMSP`, and `ProviderMSP`. Its peer/orderer deployment and persistent state are owned by the Fabric Compose files under `orgs/hospital/EHR_hospitalOrg-main/ehr-network/`.
- **Hospital:** React portal on `5173`; peer APIs on `4001`–`4004`; patient API on `4005`; IPFS bridge on `4006`.
- **Patient:** separate React portal on `5174` (also routed as `/patient/`).
- **Dashboard:** optional `dashboard-api` on `4010` and portal on `5176`, served under `/dashboard/`. It is read-only and uses a local NDJSON event cache, JWT role policy, and event routes. Real Fabric collection requires its observer identity; other emitters are pending.
- **Lab:** Express gateway and static console on host port `3006`, routed as `/lab/`. Its standalone Fabric/network assets are not automatically started by root `./start.sh`.
- **Pharmacy:** backend on `3000`; manager `3001`, employee `3002`, inventory `3003`, billing `3005`, main frontend `5175`. They remain separate applications. Pharmacy patient source is absent; current pharmacy ledger configuration does not match the root Fabric topology.
- **Digilocker:** proposal/inventory item only; there is no runnable Digilocker app here.

## What the dashboard shows

Dashboard pages distinguish observed values from configured topology and unavailable sources. Health checks are HTTP GETs. Block events include Fabric transaction metadata only; invocation arguments and read/write sets are not collected. AI, history, governance, FHIR, security, lab, and pharmacy event producers must be connected by their owning teams. CPU, memory, disk, and IPFS storage metrics are deferred.

The dashboard's event store can be rebuilt from retained NDJSON files and is not tamper-evident. Do not treat it as the authoritative clinical or compliance audit record. No patient clinical content belongs in dashboard events.

## Start the workspace

Use `./start.sh` from the repository root after Docker is available and existing Fabric identity/CA state has been provisioned. The script starts the existing network and app containers without reenrollment, ledger reset, channel initialization, chaincode deployment, or volume deletion. It starts dashboard services only if the dashboard API's local `.env` exists. Use `./stop.sh` to stop containers while preserving volumes.

See [README.md](../README.md), [architecture](architecture.md), and [setup guide](setup-guide.md) for routes and exact behavior.
