# Contributing to the EHR Blockchain workspace

The repository contains independently owned services. Keep changes scoped, preserve other contributors' work, and coordinate before changing shared Fabric, gateway, deployment, or cross-team interfaces.

## Branches and commits

Use the branch naming convention agreed by the team. For Group 1 work, the active branch is `himanshu/group1-realtime-events`. Do not commit directly to `main`. Use descriptive commit subjects and include a body when a commit spans several modules. Push only the explicitly named branch.

## Before changing interfaces

- Read the relevant module README and the root [current implementation guide](README.md).
- Treat the root Compose/Nginx entry points and `./start.sh` as the local integration path. Standalone Swarm/multi-host scripts may describe other deployments.
- Do not edit another team's API, chaincode, security, FHIR, AI, pharmacy, or lab implementation without coordinating with its owner.
- Keep incomplete integrations visibly unavailable. Do not show synthetic or fallback data as live service data.
- For dashboard events, preserve the zero-PHI validator and server-side role filtering. Do not add patient names, raw IDs, clinical values, or AI narrative.

## Secrets and data

Use synthetic test data locally. Never commit `.env` files, JWT/service keys, wallet contents, TLS private keys, or patient data. Do not paste secrets into issues, reviews, or chat. Do not make Docker's socket world-writable.

## Local setup

Use the repository-root `./start.sh` after Docker and existing Fabric identity/CA state are ready. Use `./stop.sh` to stop containers while preserving volumes. See [`docs/setup-guide.md`](docs/setup-guide.md) for the current root workflow and [`orgs/hospital/EHR_hospitalOrg-main/README.md`](orgs/hospital/EHR_hospitalOrg-main/README.md) for the separately retained legacy multi-system guide.
