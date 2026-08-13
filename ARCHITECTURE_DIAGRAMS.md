# System Architecture Diagrams 📐📊

> **Mermaid.js Visualizations for Architecture, Sequence Flow & Data Entity Relationships**

---

## 1. Complete System Architecture Diagram

```mermaid
flowchart TB
    subgraph PresentationLayer["Presentation Layer (React + Vite)"]
        UI_Admin["Admin Dashboard"]
        UI_Doctor["Doctor Portal"]
        UI_Patient["Patient Consent Manager"]
        UI_Lab["Lab Tech Interface"]
        UI_Pharm["Pharmacy Inventory Portal"]
    end

    subgraph APILayer["API Gateway & Middleware Layer (Express.js)"]
        API_Hosp["Hospital Gateway (Port 4000)"]
        API_Lab["Lab Gateway & AI Proxy (Port 3000)"]
        API_Pharm["Pharmacy Gateway (Port 4004)"]
        Auth_JWT["JWT & Fabric Identity Wallet"]
    end

    subgraph AILayer["Agentic AI Pipeline"]
        Extractor["PDF/Image Text Extractor"]
        Agent_Triage["Lab Report Analysis Agent"]
        Agent_CDS["Clinical Decision Support Agent"]
        Gemini_LLM["Gemini 2.5 Flash API"]
    end

    subgraph BlockchainLayer["Hyperledger Fabric v2.5 Blockchain Network"]
        Orderer["Raft Ordering Service (orderer.example.com)"]
        
        subgraph HospOrg["Hospital Org Peers"]
            Peer_H0["peer0.hospital"]
            Couch_H0[("CouchDB State")]
        end
        
        subgraph LabOrg["Lab Org Peers"]
            Peer_L0["peer0.lab"]
            Couch_L0[("CouchDB State")]
        end

        subgraph PharmOrg["Pharmacy Org Peers"]
            Peer_P0["peer0.pharmacy"]
            Couch_P0[("CouchDB State")]
        end
    end

    subgraph StorageLayer["Decentralized Storage Layer"]
        IPFS_Kubo[("IPFS Kubo Node (Port 5001)")]
    end

    UI_Doctor -->|HTTP REST| API_Hosp
    UI_Lab -->|Multipart Form| API_Lab
    UI_Pharm -->|HTTP REST| API_Pharm
    
    API_Hosp --> Auth_JWT
    API_Lab --> Auth_JWT
    
    API_Lab --> Extractor
    Extractor --> Agent_Triage
    Agent_Triage --> Gemini_LLM
    Agent_CDS --> Gemini_LLM
    
    API_Lab -->|Upload PDF / JSON| IPFS_Kubo
    Agent_Triage -->|Save AI Output| IPFS_Kubo
    
    API_Hosp -->|Signed gRPC| Peer_H0
    API_Lab -->|Signed gRPC| Peer_L0
    API_Pharm -->|Signed gRPC| Peer_P0
    
    Peer_H0 <--> Orderer
    Peer_L0 <--> Orderer
    Peer_P0 <--> Orderer
    
    Peer_H0 --- Couch_H0
    Peer_L0 --- Couch_L0
    Peer_P0 --- Couch_P0
```

---

## 2. Sequence Diagram: Doctor Updating Patient Health Record

```mermaid
sequenceDiagram
    autonumber
    actor Doctor as Doctor / Clinician
    participant UI as React Frontend UI
    participant API as Backend API Gateway
    participant IPFS as IPFS Kubo Node
    participant Fabric as Fabric Peer (peer0)
    participant Orderer as Raft Orderer Node
    participant Ledger as Ledger & CouchDB

    Doctor->>UI: Select Patient & Submit Updated Record JSON
    UI->>API: POST /api/ehr/update (JWT + PatientId + Record JSON)
    
    API->>API: Verify JWT & Doctor Role
    API->>IPFS: Pin Updated EHR JSON Payload
    IPFS-->>API: Return New IPFS CID (newCID) & SHA256 Digest
    
    API->>Fabric: Evaluate CheckAccess(patientId, doctorId, 'ehr')
    Fabric-->>API: Access Granted (Unexpired On-Chain Grant Verified)
    
    API->>Fabric: SubmitTx UpdateEHRCID(patientId, newCID, section, reason)
    Fabric->>Fabric: Execute Chaincode & Verify Endorsement Policy
    Fabric->>Orderer: Forward Signed Endorsed Transaction Proposal
    Orderer->>Orderer: Package Transaction into Block & Consensus Sign
    Orderer->>Fabric: Broadcast New Block to All Peers
    Fabric->>Ledger: Commit Block & Update World State Key EHR:patientId
    Fabric-->>API: Return Transaction Success Confirmation (TxID)
    API-->>UI: 200 OK (TxID, newCID)
    UI-->>Doctor: Display Success Toast & Updated Audit History
```

---

## 3. Entity-Relationship Diagram (ERD): On-Chain & Off-Chain Data Entities

```mermaid
erDiagram
    PATIENT {
        string patientId PK
        string nameHash
        string dob
        string gender
        string createdAt
    }

    ACCESS_GRANT {
        string grantId PK
        string patientId FK
        string granteeId
        string sections
        string expiresAt
        boolean revoked
    }

    EHR_RECORD {
        string patientId PK
        string currentCID
        string createdAt
        string updatedAt
    }

    CID_HISTORY_ENTRY {
        string cid PK
        string patientId FK
        string updatedBy
        string updatedAt
        string section
        string reason
    }

    LAB_RESULT {
        string resultId PK
        string patientId FK
        string testCode
        string collectedAt
        string status
        string rawDataCid
    }

    IPFS_PAYLOAD {
        string cid PK
        string sha256Digest
        int byteLength
        string contentType
        json contentBody
    }

    AI_SUMMARY_ARTIFACT {
        string summaryCid PK
        string resultId FK
        string provider
        string model
        string summaryText
        string recommendation
        string confidence
    }

    PATIENT ||--o{ ACCESS_GRANT : "grants consent to"
    PATIENT ||--|| EHR_RECORD : "owns"
    EHR_RECORD ||--o{ CID_HISTORY_ENTRY : "maintains audit log of"
    PATIENT ||--o{ LAB_RESULT : "has test results"
    LAB_RESULT ||--|| IPFS_PAYLOAD : "stores off-chain raw data in"
    LAB_RESULT ||--o| AI_SUMMARY_ARTIFACT : "links agentic analysis in"
```
