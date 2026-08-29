# Lab Org Multi-Host Hyperledger Fabric Setup

This repository gives you a `1 peer org + 1 orderer org` Fabric network for your EHR project:

- Machine 1: `orderer.example.com` and `peer0.lab.example.com`
- Machine 2: `peer1.lab.example.com`
- Machine 3: `peer2.lab.example.com`

Runtime split:

- Machine 1: macOS with `Colima`
- Machine 2: Ubuntu with native `Docker Engine`
- Machine 3: Ubuntu with native `Docker Engine`

## What This Repo Creates

- One application org: `LabMSP`
- Three Lab peers across three different computers
- One orderer on machine 1
- One application channel: `ehrchannel`
- CouchDB on each peer host
- Fixed hostnames, so you can fill in IPs later via `/etc/hosts` without regenerating certs

## Hostnames

The certificates are generated for these names:

- `orderer.example.com`
- `peer0.lab.example.com`
- `peer1.lab.example.com`
- `peer2.lab.example.com`

When you have the real IPs, add them on all 3 machines in `/etc/hosts`:

```text
10.166.46.138 orderer.example.com peer0.lab.example.com
10.166.46.204 peer1.lab.example.com
10.166.46.38 peer2.lab.example.com
```

There is a ready-made file in [templates/hosts.final](/Users/prasoonk/Projects/laborg/templates/hosts.final).

## Assumptions

- You are using modern Fabric, not Fabric v1.4.
- Machine 1 is macOS and runs `Colima`.
- Machines 2 and 3 are Ubuntu and run native Docker.
- Port `7050` on machine 1 is reachable from machines 2 and 3.
- Port `7051` on each machine is reachable from the other machines.

## Repo Layout

- [config/crypto-config.yaml](/Users/prasoonk/Projects/laborg/config/crypto-config.yaml): crypto material definition
- [config/configtx.yaml](/Users/prasoonk/Projects/laborg/config/configtx.yaml): channel and orderer config
- [docker/docker-compose.machine1.yaml](/Users/prasoonk/Projects/laborg/docker/docker-compose.machine1.yaml): orderer + peer0
- [docker/docker-compose.machine2.yaml](/Users/prasoonk/Projects/laborg/docker/docker-compose.machine2.yaml): peer1
- [docker/docker-compose.machine3.yaml](/Users/prasoonk/Projects/laborg/docker/docker-compose.machine3.yaml): peer2
- [env/network.env](/Users/prasoonk/Projects/laborg/env/network.env): shared values
- [env/machine1.env](/Users/prasoonk/Projects/laborg/env/machine1.env): machine 1 values
- [env/machine2.env](/Users/prasoonk/Projects/laborg/env/machine2.env): machine 2 values
- [env/machine3.env](/Users/prasoonk/Projects/laborg/env/machine3.env): machine 3 values
- [scripts/](/Users/prasoonk/Projects/laborg/scripts): helpers for install, startup, channel creation, and joins
- [scripts/install-prereqs-ubuntu.sh](/Users/prasoonk/Projects/laborg/scripts/install-prereqs-ubuntu.sh): Ubuntu Docker install helper
- [scripts/use-docker-linux.sh](/Users/prasoonk/Projects/laborg/scripts/use-docker-linux.sh): Docker runtime check for Ubuntu machines
- [chaincode/lab-results](/Users/prasoonk/Projects/laborg/chaincode/lab-results): sample EHR lab results smart contract
- [client/node-gateway](/Users/prasoonk/Projects/laborg/client/node-gateway): sample Node.js gateway client

## Machine 1 Setup

Run these from this repo on machine 1:

```bash
./scripts/use-colima.sh
./scripts/download-fabric.sh
./scripts/generate-artifacts.sh
```

Before starting the containers, make sure machine 1 can resolve its local services:

```text
10.166.46.138 orderer.example.com peer0.lab.example.com
10.166.46.204 peer1.lab.example.com
10.166.46.38 peer2.lab.example.com
```

Then start machine 1:

```bash
./scripts/start-machine1.sh
```

Create the channel and join `peer0`:

```bash
./scripts/create-channel.sh
```

That creates:

- `channel-artifacts/ehrchannel.block`
- `connection-profiles/lab-connection.json`
- `connection-profiles/lab-connection.yaml`

## Copy To Machine 2 And Machine 3

After machine 1 has completed `generate-artifacts.sh` and `create-channel.sh`, copy the repo to the other machines.

Example:

```bash
rsync -av --delete /Users/prasoonk/Projects/laborg/ user@MACHINE2:~/laborg/
rsync -av --delete /Users/prasoonk/Projects/laborg/ user@MACHINE3:~/laborg/
```

This is why I generated all 3 peer definitions up front. The copied repo will already contain:

- crypto for `peer1` and `peer2`
- orderer TLS certs
- `ehrchannel.block`

## Machine 2 Setup

On machine 2:

1. Update `/etc/hosts` with the real IPs.
2. [env/machine2.env](/Users/prasoonk/Projects/laborg/env/machine2.env) is already filled with `10.166.46.204`.
3. If Docker is not installed yet:

```bash
chmod +x scripts/*.sh
./scripts/install-prereqs-ubuntu.sh
```

4. Run:

```bash
cd ~/laborg
chmod +x scripts/*.sh
./scripts/use-docker-linux.sh
./scripts/download-fabric.sh
./scripts/start-machine2.sh
./scripts/join-channel.sh peer1
```

## Machine 3 Setup

On machine 3:

1. Update `/etc/hosts` with the real IPs.
2. [env/machine3.env](/Users/prasoonk/Projects/laborg/env/machine3.env) is already filled with `10.166.46.38`.
3. If Docker is not installed yet:

```bash
chmod +x scripts/*.sh
./scripts/install-prereqs-ubuntu.sh
```

4. Run:

```bash
cd ~/laborg
chmod +x scripts/*.sh
./scripts/use-docker-linux.sh
./scripts/download-fabric.sh
./scripts/start-machine3.sh
./scripts/join-channel.sh peer2
```

## Stop Commands

```bash
./scripts/stop-machine1.sh
./scripts/stop-machine2.sh
./scripts/stop-machine3.sh
```

## Important Notes

- This setup uses `cryptogen` for simpler academic/project bootstrap. If you want a more production-like setup later, we should migrate to Fabric CA.
- The connection profile files are in [connection-profiles/](/Users/prasoonk/Projects/laborg/connection-profiles).
- Because the peers are on different machines, each machine can safely use the same peer port `7051`.
- `peer1` and `peer2` bootstrap to `peer0` using `peer0.lab.example.com:7051`.
- Machines 2 and 3 must run `./scripts/download-fabric.sh` on Ubuntu because the Mac binaries copied from machine 1 will not run there.
- If Docker says permission denied on Ubuntu, log out and log back in after `usermod -aG docker $USER`.

## Verify All Three Peers

After `peer1` and `peer2` have joined the channel, run this on machine 1:

```bash
./scripts/verify-network.sh
```

You can also check a single peer:

```bash
./scripts/verify-channel.sh peer0
./scripts/verify-channel.sh peer1
./scripts/verify-channel.sh peer2
```

## Deploy The Sample Lab Results Chaincode

This repo now includes a starter smart contract at [chaincode/lab-results](/Users/prasoonk/Projects/laborg/chaincode/lab-results).

1. On machine 1, deploy it to the channel:

```bash
./scripts/deploy-labresults-machine1.sh
```

That will:

- package the chaincode
- install it on `peer0`
- approve and commit the definition on `ehrchannel`
- invoke `InitLedger`
- query all seeded lab results

2. Re-copy the repo to machine 2 and machine 3, because the packaged chaincode is now inside `.generated/chaincode-packages`.

3. On machine 2, install the same package on `peer1`:

```bash
./scripts/install-chaincode.sh peer1
```

4. On machine 3, install the same package on `peer2`:

```bash
./scripts/install-chaincode.sh peer2
```

5. Verify the committed definition on machine 1:

```bash
./scripts/query-committed-chaincode.sh
```

6. Query the chaincode:

```bash
./scripts/query-labresults.sh peer0 GetAllLabResults
./scripts/query-labresults.sh peer1 GetAllLabResults
./scripts/query-labresults.sh peer2 GetAllLabResults
```

7. Submit a new lab result from machine 1:

```bash
./scripts/invoke-labresults.sh CreateLabResult \
  labresult3 \
  patient-1003 \
  LIPID \
  2026-04-19T10:30:00Z \
  REPORTED \
  '{"hdl":"54","ldl":"110","triglycerides":"145"}'
```

Then read it back:

```bash
./scripts/query-labresults.sh peer0 ReadLabResult labresult3
./scripts/query-labresults.sh peer0 GetLabResultsByPatient patient-1003
```

## Use The Node.js Client

The sample gateway client is in [client/node-gateway](/Users/prasoonk/Projects/laborg/client/node-gateway) and reads [connection-profiles/lab-connection.json](/Users/prasoonk/Projects/laborg/connection-profiles/lab-connection.json).

On any machine that has Node.js installed and can reach `peer0.lab.example.com:7051`:

```bash
cd client/node-gateway
npm install
node index.js getAll
node index.js read labresult1
node index.js byPatient patient-1001
node index.js create labresult4 patient-1004 HB1AC 2026-04-19T11:00:00Z REPORTED '{"hba1c":"6.4"}'
node index.js updateStatus labresult2 REPORTED
```

The client uses the existing `User1@lab.example.com` identity already generated in this repo, so no extra enrollment step is needed.

### Web Dashboard

The same gateway logic now includes a browser UI in [client/node-gateway/public](/Users/prasoonk/Projects/laborg/client/node-gateway/public).

Start it from [client/node-gateway](/Users/prasoonk/Projects/laborg/client/node-gateway):

```bash
cd client/node-gateway
npm install
npm run web
```

Then open:

```text
http://localhost:3000
```

The dashboard lets you:

- choose the gateway peer (`peer0`, `peer1`, or `peer2`)
- view all lab records
- read by result ID
- query by patient ID
- create a new lab record
- update a lab record status

### Hyperledger Explorer

Machine 1 now also runs Hyperledger Explorer through the same compose stack in [docker/docker-compose.machine1.yaml](/Users/prasoonk/Projects/laborg/docker/docker-compose.machine1.yaml).

Explorer is started automatically when you run:

```bash
./scripts/start-machine1.sh
```

Open Explorer at:

```text
http://localhost:8081
```

Or from another machine on the LAN:

```text
http://10.166.46.138:8081
```

Notes:

- Explorer reads the network using [explorer/config.json](/Users/prasoonk/Projects/laborg/explorer/config.json).
- The Fabric profile used by Explorer is [explorer/connection-profile/lab-explorer.json](/Users/prasoonk/Projects/laborg/explorer/connection-profile/lab-explorer.json).
- In this setup, Explorer is anchored to `peer0.lab.example.com` for ledger browsing, which is enough to inspect blocks, transactions, chaincodes, and channel state.
- Explorer UI port is configurable with `EXPLORER_PORT` in [env/network.env](/Users/prasoonk/Projects/laborg/env/network.env).

### IPFS Off-Chain Payload Mode

Machine 1 now includes an IPFS Kubo node in [docker/docker-compose.machine1.yaml](/Users/prasoonk/Projects/laborg/docker/docker-compose.machine1.yaml) with:

- API: `http://10.166.46.138:5001`
- Gateway: `http://10.166.46.138:8080`

To start IPFS with the Fabric stack on machine 1:

```bash
./scripts/start-machine1.sh
```

Check IPFS health from the gateway server:

```bash
curl -sS http://localhost:3000/api/ipfs/health
```

Create records with IPFS from the web dashboard:

- enable `Store result payload in IPFS (CID anchored on-chain)`
- submit the create form
- on-chain `resultData` stores CID + digest metadata
- full payload is resolved through IPFS

New backend endpoints:

- `POST /api/ipfs/add-json`
- `GET /api/ipfs/json/:cid`
- `POST /api/records/ipfs`
- `GET /api/records/:resultId/resolve-data`
- `POST /api/ai/analyze`

IPFS defaults are in [env/network.env](/Users/prasoonk/Projects/laborg/env/network.env):

- `IPFS_API_URL`
- `IPFS_GATEWAY_URL`

Cross-machine note for AI/IPFS submissions:

- IPFS runs on machine 1 and is exposed at `10.166.46.138`.
- All machines should use shared `IPFS_API_URL` and `IPFS_GATEWAY_URL` from [env/network.env](/Users/prasoonk/Projects/laborg/env/network.env).
- Gateway server binds to `0.0.0.0` via `GATEWAY_BIND_HOST`, so other machines can access machine 1 dashboard/API at:
  - `http://10.166.46.138:3000`

Two valid operating modes:

1. Centralized gateway mode (recommended)
  - Run `node server.js` only on machine 1.
  - Open the dashboard from machine2/machine3 browser using machine1 URL.

2. Per-machine gateway mode
  - Run gateway on each machine locally.
  - Keep IPFS URLs pointing to machine1 in shared env.
  - Ensure machine1 firewall allows inbound `5001`, `8080`, and `3000`.

### Gemini Agentic AI Features

The gateway now includes two AI agents (Gemini-powered):

1. **Lab Report Analysis Agent**
  - Reads incoming lab payloads.
  - Detects possible abnormalities.
  - Generates summary metadata (for example, low Hb pattern -> possible anemia wording).

2. **Clinical Decision Support Agent**
  - Uses current result plus patient history from Fabric.
  - Suggests assistive next-review steps and possible risks.
  - Explicitly non-diagnostic and non-final.

Current flow in `POST /api/records/ipfs`:

- Accept either:
  - JSON `resultData`
  - or multipart upload with `reportFile` (PDF/image), with optional `resultData`
- If `reportFile` is uploaded, store the binary in IPFS and extract report text.
- Build payload envelope in IPFS containing result data, file CID metadata, and extracted text.
- Run both AI agents (enabled by default, can be disabled with `runAiAgents=false`).
- Feed extracted report text (when available) to both AI agents as additional context.
- Store AI summary artifact on IPFS.
- Anchor both CIDs and compact AI metadata in on-chain `resultData`.

Response fields include:

- `ipfs`: raw data CID metadata
- `reportFileIpfs`: uploaded report binary CID metadata (when file is provided)
- `extractedTextChars`: extracted report text length (when available)
- `ai`: full AI output (analysis + decision support + disclaimer)
- `aiIpfs`: AI summary CID metadata

Example multipart upload (PDF/image + optional JSON result data):

```bash
curl -sS -X POST http://localhost:3000/api/records/ipfs \
  -F 'resultId=labresult-file-1' \
  -F 'patientId=patient-2001' \
  -F 'testCode=CBC' \
  -F 'collectedAt=2026-04-24T09:30:00Z' \
  -F 'status=REPORTED' \
  -F 'runAiAgents=true' \
  -F 'resultData={"lab":"external-pdf"}' \
  -F 'reportFile=@/absolute/path/to/lab-report.pdf;type=application/pdf'
```

Use the standalone AI endpoint for pre-submit analysis:

```bash
curl -sS -X POST http://localhost:3000/api/ai/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "patientId":"patient-1001",
    "testCode":"CBC",
    "resultData":{"hb":"8.5","wbc":"9600"},
    "persistToIpfs": true
  }'
```

Gemini defaults in [env/network.env](/Users/prasoonk/Projects/laborg/env/network.env):

- `GEMINI_MODEL`
- `GEMINI_API_KEY`

If Gemini is unavailable, the server falls back to basic heuristic summaries so record submission can continue.

### Project Summary: What Is Done

This project has moved from baseline Fabric setup to an end-to-end EHR lab workflow with off-chain payload storage and AI-assisted interpretation.

Completed implementation includes:

1. **Three-machine Fabric network is operational**
  - `Machine 1`: `orderer + peer0 + couchdb + ipfs + explorer`
  - `Machine 2`: `peer1 + couchdb`
  - `Machine 3`: `peer2 + couchdb`
  - Channel (`ehrchannel`) and connection profiles are generated and in use.

2. **Chaincode lifecycle and submit path are stable**
  - `labresults` chaincode is deployed and queried successfully.
  - Endorsement mismatch issues were resolved by recommit strategy and policy alignment.

3. **Gateway + Web dashboard are integrated**
  - REST APIs for create/read/update/query.
  - Peer-selectable reads/writes from dashboard.
  - Updated responsive UI for operational usage.

4. **IPFS off-chain mode is live**
  - Raw lab payload is stored in IPFS.
  - On-chain record stores CID, digest, byte length, schema metadata.
  - Resolve endpoint reconstructs full payload from CID.

5. **Gemini-based agentic AI is implemented**
  - Lab report analysis and clinical decision support are integrated.
  - AI output is persisted to IPFS and linked from on-chain metadata.
  - Fallback heuristic mode is active when Gemini is unavailable.

### Individual Contribution By Machine

#### Machine 1 Contribution (Control Plane + AI Orchestrator)

Primary contribution:

- Hosts network control plane and main API surface.
- Runs `orderer.example.com`, `peer0.lab.example.com`, `couchdb-peer0`, and `ipfs.lab.example.com`.
- Runs lifecycle-critical operations:
  - artifact generation
  - channel creation
  - chaincode approve/commit/invoke validation
- Hosts Node gateway (`client/node-gateway/server.js`) where:
  - `/api/records/ipfs` orchestrates full flow
  - `/api/ai/analyze` serves standalone AI inference
  - Gemini calls and fallback logic are executed

Why this matters:

- Machine 1 is the transaction entry point and orchestration brain.
- It anchors both raw evidence and AI evidence references on-chain.

#### Machine 2 Contribution (Peer Replication + Clinical Context Module Host)

Primary contribution:

- Hosts `peer1.lab.example.com` and its CouchDB state database.
- Joins `ehrchannel` and installs the same chaincode package.
- Provides additional endorsement/read path for resilience.

AI contribution split (module ownership):

- Best placement for **Clinical Context and Decision Support module**.
- Reads longitudinal patient history via peer-local evaluate calls.
- Produces risk-oriented assistive recommendations from current + historical data.

Why this matters:

- Keeps heavy history-correlation work off the control-plane node.
- Uses replicated ledger state close to peer1 for predictable reads.

#### Machine 3 Contribution (Peer Replication + Governance/Provenance Module Host)

Primary contribution:

- Hosts `peer2.lab.example.com` and its CouchDB state database.
- Joins `ehrchannel` and installs chaincode package.
- Adds third-node endorsement and fault-tolerance coverage.

AI contribution split (module ownership):

- Best placement for **Governance, guardrail, and provenance module**.
- Validates that AI output remains assistive (non-diagnostic language).
- Attaches audit metadata such as model/version, prompt hash, output CID, and policy check result.

Why this matters:

- Separates governance concerns from generation concerns.
- Improves auditability and compliance posture for clinical workflows.

### In-Depth Architecture: 3 Agentic AI Modules Across 3 Machines

Current runtime state:

- AI is already functional in Machine 1 gateway.
- For production-style scaling, split into three explicit modules mapped one-per-machine.

#### Module A (Machine 1): Lab Report Ingestion and Abnormality Triage

Responsibilities:

- Accept incoming report from dashboard/API.
- Validate payload structure and normalize input shape.
- Store raw payload in IPFS and obtain `rawDataCid`.
- Run first-pass Gemini analysis (abnormality summary).

Output artifact:

- `triageSummary`
- `abnormalities[]`
- `riskFlags[]`
- `triageCid` (IPFS)

#### Module B (Machine 2): Clinical Decision Support from Patient History

Responsibilities:

- Pull patient history from ledger (`GetLabResultsByPatient`).
- Merge current report + historical trends.
- Generate assistive next-step recommendations and possible risks.

Output artifact:

- `recommendation`
- `possibleRisks[]`
- `nextSteps[]`
- `decisionSupportCid` (IPFS)

#### Module C (Machine 3): Governance, Provenance, and Commit Guard

Responsibilities:

- Validate language policy and confidence bounds.
- Ensure response is advisory, not a final diagnosis.
- Attach provenance and policy evidence.
- Produce final commit-ready metadata package.

Output artifact:

- `governanceStatus`
- `policyChecks[]`
- `provenance` object (model, timestamp, prompt hash, output CIDs)
- `governanceCid` (IPFS)

#### End-to-End Data Path (Detailed)

1. Client submits report to Machine 1.
2. Module A stores raw payload CID and triage artifact CID.
3. Module A forwards compact context to Module B on Machine 2.
4. Module B reads patient history from peer1 state and produces decision-support CID.
5. Module B forwards outputs to Module C on Machine 3.
6. Module C applies policy/guardrails and generates governance CID.
7. Machine 1 receives final approved metadata package.
8. Machine 1 submits chaincode transaction with CID references anchored in `resultData.ai`.

Suggested on-chain AI anchor shape:

```json
{
  "storage": "ipfs",
  "cid": "<rawDataCid>",
  "digest": "<rawDigest>",
  "ai": {
    "enabled": true,
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "triageCid": "<triageCid>",
    "decisionSupportCid": "<decisionSupportCid>",
    "governanceCid": "<governanceCid>",
    "summaryCid": "<finalSummaryCid>",
    "disclaimer": "Assistive output only. Clinician review required."
  }
}
```

This architecture keeps each machine's role clear:

- Machine 1: ingress + commit orchestration
- Machine 2: history-aware reasoning
- Machine 3: policy and audit enforcement

## Exact Order To Run Everything

1. Machine 1:

```bash
./scripts/use-colima.sh
./scripts/download-fabric.sh
./scripts/generate-artifacts.sh
./scripts/start-machine1.sh
./scripts/create-channel.sh
```

2. Copy the repo to machines 2 and 3.

3. Machine 2:

```bash
./scripts/use-docker-linux.sh
./scripts/download-fabric.sh
./scripts/start-machine2.sh
./scripts/join-channel.sh peer1
```

4. Machine 3:

```bash
./scripts/use-docker-linux.sh
./scripts/download-fabric.sh
./scripts/start-machine3.sh
./scripts/join-channel.sh peer2
```
