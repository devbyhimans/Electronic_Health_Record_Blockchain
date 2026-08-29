# Enterprise Blockchain Electronic Health Record (EHR) System 🏥⚡

> **Decentralized Multi-Organization Healthcare Federation powered by Hyperledger Fabric v2.5, IPFS Kubo, Attribute-Based Access Control (ABAC), and Gemini Agentic AI.**

## What is this project?

The **Blockchain Electronic Health Record (EHR) System** is an enterprise-grade, federated healthcare network designed to solve the critical challenges of data fragmentation, unauthorized medical record access, single points of failure, and data tampering in traditional hospital IT systems.

It connects independent healthcare stakeholders (Hospital, Pharmacy, Lab, and Digilocker) into a single, unified Hyperledger Fabric blockchain network. The system strictly enforces Attribute-Based Access Control (ABAC) and Patient Sovereignty, meaning patients cryptographically own their data and clinicians cannot view patient records without explicit on-chain consent grants. 

Heavy clinical documents (like PDFs) are stored off-chain on IPFS, with only lightweight cryptographic hashes and metadata anchored on the ledger. LLM-powered autonomous agents (Gemini) are integrated to parse unstructured data and provide clinical decision support.

## Architecture

For a detailed view of the system's architecture, flowcharts, and technical stack, please refer to:
- [Architecture Documentation](docs/architecture.md)
- [Implementation Roadmap](docs/roadmap.md)

## Prerequisites

- **OS:** Ubuntu 22.04 LTS (recommended), macOS, or Windows with WSL2/Docker Desktop.
- **Tools:** Docker v24.0+, Docker Compose v2.20+, Node.js v18.x LTS, Git, cURL, jq
- **Fabric Binaries:** Hyperledger Fabric v2.5.x binaries

## Quickstarts

The codebase has been refactored so that each organization can be run locally in a single-machine mode for development and testing.

Detailed step-by-step instructions for booting up the network for each organization are available in the [Setup Guide](docs/setup-guide.md).

* **Hospital Org:** `orgs/hospital/`
* **Pharmacy Org:** `orgs/pharmacy/`
* **Lab Org:** `orgs/lab/`

Before running any script, make sure to copy all `.env.example` files to `.env` in the respective folders and fill in any required variables.

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
