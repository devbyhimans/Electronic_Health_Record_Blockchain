# Setup Guide

This guide provides instructions to run each organization in standalone/single-node mode for local development.

> [!IMPORTANT]
> **Operating System & Terminal Requirements**
> - **Windows Users:** You **MUST** use an Ubuntu WSL (Windows Subsystem for Linux) terminal. Do not use standard Command Prompt or PowerShell, as the Fabric bash scripts will fail.
> - **macOS / Linux Users:** You can use your standard native Terminal.
> - **Docker:** Ensure Docker Desktop is open and running in the background before executing any scripts. For Windows, ensure Docker's WSL Integration is enabled for your Ubuntu distribution.

## Hospital Organization

To bring up the Hospital organization on a single node:

1. Navigate to the hospital network directory:
   ```bash
   cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
   ```
2. Download Fabric binaries (if not already cached):
   ```bash
   mkdir -p .generated && cd .generated
   curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
   chmod +x install-fabric.sh
   ./install-fabric.sh --fabric-version 2.5.15 --ca-version 1.5.17 binary docker samples
   export PATH=$PWD/fabric-samples/bin:$PATH
   cd ..
   ```
3. Boot up the network:
   ```bash
   bash scripts/network-up.sh
   ```
4. Start the backend API:
   ```bash
   cd ../ehr-backend-v3/peer0-api
   npm install && npm start
   ```
5. Start the frontend UI:
   ```bash
   cd ../../ehr-frontend-v2
   npm install && npm run dev
   ```

## Pharmacy Organization

To bring up the Pharmacy organization on a single node:

1. Navigate to the pharmacy network directory:
   ```bash
   cd orgs/pharmacy/fabric-network-swarm
   ```
2. Set up the `.env` configuration for single node:
   ```bash
   cp deploy.env.example deploy.env
   ```
3. Run the full deployment script:
   ```bash
   bash deploy.sh
   ```
   > [!TIP]
   > The `deploy.sh` script automatically packages chaincode, launches the local Fabric network, creates the channel, commits chaincode, imports identities, and starts the frontend/backend apps.

## Lab Organization

To bring up the Lab organization on a single node:

1. Navigate to the lab network directory:
   ```bash
   cd orgs/lab/EHR-LABORG-main
   ```
2. Configure your environment:
   ```bash
   cp env/network.env.example env/network.env
   # Make sure to edit env/network.env and add your GEMINI_API_KEY
   ```
3. Download Fabric binaries and generate crypto material:
   ```bash
   chmod +x scripts/*.sh
   ./scripts/download-fabric.sh
   ./scripts/generate-artifacts.sh
   ```
4. Launch the Machine 1 containers (Orderer + Peer0 + CouchDB + IPFS + Explorer):
   ```bash
   ./scripts/start-machine1.sh
   ```
5. Create the channel and join Peer0:
   ```bash
   ./scripts/create-channel.sh
   ```
6. Deploy the Lab Results Smart Contract:
   ```bash
   ./scripts/deploy-labresults-machine1.sh
   ```
7. Start the API Gateway & Web Dashboard:
   ```bash
   cd client/node-gateway
   npm install && npm run web
   ```
