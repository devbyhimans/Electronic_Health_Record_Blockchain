# Comprehensive System Overview & Beginner's Guide

Welcome to the **Enterprise Blockchain Electronic Health Record (EHR) System**! If you are new to this project, this document explains every technology used, how the different components (Peers, Organizations) interact, what is currently implemented, and where everything lives in the folder structure.

---

## 1. Core Technologies Explained

### What is the Blockchain (Hyperledger Fabric)?
Unlike Bitcoin or Ethereum where anyone can join anonymously (Public Blockchain), **Hyperledger Fabric** is a **Permissioned (Private) Blockchain**. This means only authorized hospitals, pharmacies, and labs can join the network. 
* **Role in this project:** It acts as an immutable, tamper-proof ledger. Every time a patient grants consent, a doctor updates a record, or a lab submits a result, it is permanently recorded as a transaction on this blockchain. It ensures that no single hospital can secretly alter medical records without the entire network knowing.

### What is IPFS (InterPlanetary File System)?
Blockchains are terrible at storing large files (like 10MB PDF MRI scans) because every node has to copy that data, which is incredibly slow and expensive. **IPFS** is a decentralized file storage system.
* **Role in this project:** When a doctor uploads a heavy clinical document, the actual file goes to IPFS. IPFS generates a tiny cryptographic "fingerprint" (called a CID or Content Identifier). We only store that tiny CID on the Fabric Blockchain. If the file is tampered with, its CID changes, and the blockchain will know it's a fake.

### What is Digilocker?
Currently, if a file is on IPFS, anyone who knows the CID can download and read it. For medical records, this is a massive privacy violation.
* **Role in this project:** Digilocker is a highly secure digital vault module (currently waiting to be built by one of your groups!). Its job is to take medical files, **encrypt them** (Zero-Knowledge Encryption) using the patient's keys, and *then* upload them to IPFS. This ensures that even if someone finds the file on IPFS, it looks like gibberish unless they have the patient's cryptographic permission.

### What is Agentic AI (Gemini)?
* **Role in this project:** Modern hospitals generate massive amounts of unstructured data (doctors' handwritten notes, complex lab PDFs). The system uses Gemini (Google's LLM) to act as an autonomous agent. When a lab report is uploaded, the AI reads the PDF, extracts the critical text, and flags abnormal values (Clinical Decision Support) for the doctor automatically.

---

## 2. Network Architecture (How the "Peers" work together)

In Hyperledger Fabric, the network is divided into **Organizations**. Each Organization has multiple computers/servers called **Peers**. Each Peer represents a specific department or role, running its own API and UI.

### 🏥 Hospital Organization
* **Peer 0 (Reception / Admin):** Handles patient registration and general hospital administration.
* **Peer 1 (Doctor):** Handles reading patient histories, updating diagnoses, and requesting lab tests.
* **Peer 2 (Nurse / Pharmacist / Medical Records):** Handles fulfilling prescriptions internally and maintaining ward records.

### 💊 Pharmacy Organization
* **Peer 0 (Pharmacy Node):** Contains multiple sub-modules (Manager, Billing, Employee, Inventory, Patient). It handles fulfilling prescriptions sent by the Hospital and managing drug inventory levels securely on-chain.

### 🔬 Lab Organization
* **Peer 0 (Lab Node):** Handles receiving test requests from the Hospital, conducting tests, running the results through the Gemini AI agent for analysis, and securely uploading the final encrypted PDFs to IPFS.

**How they interact:** If a Patient goes to the Hospital (Peer 0) and sees a Doctor (Peer 1), the Doctor requests a blood test. That request is logged on the blockchain. The Lab (Lab Peer 0) sees the authorized request, does the test, and uploads the result. The Doctor (Peer 1) gets an alert, views the result, and writes a prescription on the blockchain. The Pharmacy (Pharmacy Peer 0) sees the prescription and fills it. **All of this happens without a central server—they communicate purely by reading and writing to the shared blockchain ledger.**

---

## 3. Current Implementation Status

**✅ What is ALREADY Implemented:**
* The core Hyperledger Fabric v2.5 multi-org blockchain network.
* The Docker orchestration scripts (`start-all.sh` and `docker-compose.yaml`) to run all 14 Node.js apps on a single machine.
* Basic Smart Contracts (Chaincode) for creating records.
* Basic Frontend UIs (React) and Backend APIs (Express.js) for Hospital, Pharmacy, and Lab.
* IPFS Kubo node integration for off-chain file pinning.

**🚧 What is NOT Implemented (Your Tasks!):**
* **Digilocker:** Files are currently uploaded to IPFS in plaintext. Encryption needs to be built.
* **FHIR Standards:** The current JSON data structures are custom. They need to be refactored to meet standard HL7 FHIR structures.
* **Advanced ABAC:** The consent mechanism is rudimentary. A full Patient Consent Portal needs to be finalized so patients can revoke access.
* **Agentic AI Expansion:** The Gemini LLM integration needs to be expanded to analyze historical patient trends, not just single lab reports.

---

## 4. Comprehensive Folder Structure

Here is a breakdown of where everything lives and what each file does:

```text
EHR_blockchain/
├── start-all.sh                 # The master orchestration script to boot the entire project
├── docker-compose.yaml          # Orchestrates all 14 Node.js Apps into Docker containers
├── .gitignore                   # Ensures secrets (.env, crypto material) are never committed to GitHub
├── README.md                    # The main landing page for the repository
│
├── docs/                        # Documentation Folder
│   ├── architecture.md          # Contains Mermaid.js visual flowcharts of the system
│   ├── roadmap.md               # The task list and gap analysis of what needs to be built
│   ├── setup-guide.md           # Instructions for running organizations individually
│   └── system-overview.md       # (You are reading this file!)
│
└── orgs/                        # The Codebase (Divided by Organization)
    │
    ├── hospital/EHR_hospitalOrg-main/
    │   ├── ehr-network/         # The Fabric scripts to boot the Hospital blockchain nodes
    │   ├── ehr-backend-v3/      # The Node.js Express APIs for Peer0, Peer1, Peer2
    │   └── ehr-frontend-v2/     # The React UIs (hospital-portal, patient-portal)
    │
    ├── pharmacy/fabric-network-swarm/
    │   ├── deploy.sh            # Script to deploy the pharmacy blockchain network
    │   └── app/                 # Contains both the React UIs and Express Backends for Pharmacy
    │
    ├── lab/EHR-LABORG-main/
    │   ├── scripts/             # Scripts to boot the Lab blockchain nodes
    │   └── client/node-gateway/ # The Node.js Gateway + AI Integration + Lab UI
    │
    └── digilocker/
        └── README.md            # The scaffold/design document for the Digilocker module
```
