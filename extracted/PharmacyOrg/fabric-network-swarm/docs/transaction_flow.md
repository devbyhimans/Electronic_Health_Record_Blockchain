# Hyperledger Fabric Transaction Layers

These diagrams perfectly illustrate the difference between simply reading from the blockchain and writing to it. Show these in your presentation to explain how data traverses the different network layers.

### 1. Read Transaction Process (Fast & Simple)

A Read transaction only queries the current state. It **does not** change any data, so it completely bypasses the Orderer. This is called an `evaluateTransaction` in the Fabric SDK.

```mermaid
sequenceDiagram
    participant UI as React Frontend (Mohit/Ronit)
    participant API as API Gateway (Ronit)
    participant SDK as Fabric SDK (Wallet)
    participant Peer as Peer (Ankit/Mohit/Ronit)
    participant CC as Chaincode (Smart Contract)
    participant DB as CouchDB State Database

    UI->>API: GET /api/patient/pat001
    API->>SDK: Evaluate Transaction (Read)
    SDK->>Peer: Send Query Request
    Peer->>CC: Execute Chaincode Logic
    CC->>DB: Query State (pat001)
    DB-->>CC: Return JSON Data
    CC-->>Peer: Return Result
    Peer-->>SDK: Return Payload
    SDK-->>API: Parse JSON payload
    API-->>UI: Return Patient Data (200 OK)
    
    note over API,DB: The Orderer is entirely bypassed for Reads.
```

---

### 2. Write Transaction Process (Execute-Order-Validate)

A Write transaction (e.g., adding a prescription) alters the permanent blockchain state. Unlike normal databases, Fabric uses a unique 3-step architecture: **1. Endorse (Execute), 2. Order, 3. Commit (Validate).** This is called an `submitTransaction` in the Fabric SDK.

```mermaid
sequenceDiagram
    participant UI as React Frontend
    participant API as API Gateway
    participant SDK as Fabric SDK (Wallet)
    participant Peer as Peer Node (Endorser)
    participant CC as Chaincode (Smart Contract)
    participant Orderer as Raft Orderer Node
    participant DB as CouchDB State Database

    %% STEP 1: PROPOSAL & ENDORSEMENT Phase
    rect rgb(200, 220, 255)
    note over UI,CC: Phase 1: Endorsement (Simulation)
    UI->>API: POST /api/prescription (Add Data)
    API->>SDK: Submit Transaction (Write)
    SDK->>Peer: Send Transaction Proposal
    Peer->>CC: Execute rules (Simulate)
    CC-->>Peer: Return Read/Write (R/W) Set
    Peer-->>SDK: Return Cryptographically Signed Endorsement
    end

    %% STEP 2: ORDERING Phase
    rect rgb(255, 230, 200)
    note over SDK,Orderer: Phase 2: Ordering (Consensus)
    SDK->>Orderer: Send Endorsements to Orderer
    note over Orderer: Orderer groups transactions into a Block
    Orderer->>Peer: Broadcast new Block to all Peers
    end

    %% STEP 3: VALIDATION Phase
    rect rgb(200, 255, 200)
    note right of Peer: Phase 3: Validation & Commit
    Peer->>Peer: Validate Endorsements & R/W Sets
    Peer->>DB: Commit changes to CouchDB (Save permanently)
    Peer-->>SDK: Emit "Tx Committed" Event
    SDK-->>API: Confirm Transaction Success
    API-->>UI: Return Success Payload (200 OK)
    end
```

### Explaining this to the Professor
**Read vs Write:** "If you look at the diagrams, you can see CouchDB is just the final layer. The React app never touches CouchDB. For a Read, the Fabric SDK simply asks the Peer to run the Chaincode, which gets the data from CouchDB. 
For a Write, we have to endure the complex 3-step 'Execute-Order-Validate' flow to mathematically ensure the whole decentralized Swarm agrees before anything is permanently written to CouchDB."
