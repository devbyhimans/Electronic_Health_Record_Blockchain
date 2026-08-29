# Enterprise Blockchain Electronic Health Record (EHR) System 🏥⚡

> **Decentralized Multi-Organization Healthcare Federation powered by Hyperledger Fabric v2.5, IPFS Kubo, Attribute-Based Access Control (ABAC), and Gemini Agentic AI.**

## What is this project?

The **Blockchain Electronic Health Record (EHR) System** is an enterprise-grade, federated healthcare network designed to solve the critical challenges of data fragmentation, unauthorized medical record access, single points of failure, and data tampering in traditional hospital IT systems.

It connects independent healthcare stakeholders (Hospital, Pharmacy, Lab, and Digilocker) into a single, unified Hyperledger Fabric blockchain network. The system strictly enforces Attribute-Based Access Control (ABAC) and Patient Sovereignty, meaning patients cryptographically own their data and clinicians cannot view patient records without explicit on-chain consent grants. 

Heavy clinical documents (like PDFs) are stored off-chain on IPFS, with only lightweight cryptographic hashes and metadata anchored on the ledger. LLM-powered autonomous agents (Gemini) are integrated to parse unstructured data and provide clinical decision support.

## Architecture

For a detailed view of the system's architecture, flowcharts, and technical stack, please refer to:
- [Comprehensive System Overview](docs/system-overview.md) *(Start here!)*
- [Architecture Documentation](docs/architecture.md)
- [Implementation Roadmap](docs/roadmap.md)

## Prerequisites

- **OS:** Ubuntu 22.04 LTS (recommended), macOS, or Windows with WSL2/Docker Desktop.
- **Tools:** Docker v24.0+, Docker Compose v2.20+, Node.js v18.x LTS, Git, cURL, jq
- **Fabric Binaries:** Hyperledger Fabric v2.5.x binaries

## Quickstart (Running the Entire Network)

The entire federated network (Hospital, Pharmacy, Lab) and all 14 associated Node.js frontend/backend applications have been fully Dockerized for a simple, one-click startup experience.

To run the entire project on your local machine:

> [!IMPORTANT]
> **Before you begin:**
> 1. **Open Docker:** Ensure Docker Desktop is running. (Windows users: ensure WSL integration is enabled).
> 2. **Open the right Terminal:** Windows users **must** open an Ubuntu WSL terminal to run these commands. Standard CMD/PowerShell will fail. macOS/Linux users can use their native Terminal.

1. **Download Fabric Binaries:** Ensure you have the Hyperledger Fabric binaries downloaded. If you don't have them, refer to the [Setup Guide](docs/setup-guide.md) to download them into your local cache.
2. **Launch Orchestrator:** From the root of this repository, run the orchestrator script:
   ```bash
   bash start-all.sh
   ```
   *This script automatically sets up environment variables, launches all three Fabric blockchain networks, and starts the applications using Docker Compose.*

3. **Access the Applications:** Once the orchestrator finishes, you can access the portals directly from your host browser:
   * **Hospital UIs:** `http://localhost:5173` (Reception) | `http://localhost:5174` (Patient)
   * **Pharmacy UIs:** `http://localhost:3001` through `3005`
   * **Lab Gateway:** `http://localhost:3006`

### Running Individual Organizations

If you are a student group focusing **only on your specific module** and do not want to spin up the entire federated network, you can start just your organization in isolation. 

Detailed, step-by-step instructions for booting up each organization individually are available in the [Setup Guide](docs/setup-guide.md).

* **Hospital Org Codebase:** `orgs/hospital/`
* **Pharmacy Org Codebase:** `orgs/pharmacy/`
* **Lab Org Codebase:** `orgs/lab/`

## Module Ownership Table

The project has been divided among multiple groups. The table below outlines module assignments.

| Module | Location | Assigned Group |
| :--- | :--- | :--- |
| **Hospital Organization** | `orgs/hospital/` | TBD |
| **Pharmacy Organization** | `orgs/pharmacy/` | TBD |
| **Lab Organization** | `orgs/lab/` | TBD |
| **Digilocker System** | `orgs/digilocker/` | TBD |
| **Agentic AI Integration** | (Cross-module) | TBD |
Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming conventions, PR requirements, and instructions on forking the repository.
