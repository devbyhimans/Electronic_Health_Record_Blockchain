# MedBlock v2: Complete System Architecture

This architectural diagram maps out your entire technical stack exactly as it is deployed across the three physical machines. You can screenshot this and put it directly into your presentation or report!

### The Comprehensive Architecture Map

```mermaid
flowchart TB
    %% Styling configurations
    classDef master fill:#2B3A42,stroke:#3b5998,stroke-width:2px,color:#fff
    classDef worker fill:#3F5765,stroke:#4CAF50,stroke-width:2px,color:#fff
    classDef external fill:#FF9800,stroke:#E65100,stroke-width:2px,color:#fff
    classDef react fill:#61DAFB,stroke:#282C34,stroke-width:1px,color:#111
    classDef nodejs fill:#8CC84B,stroke:#333,stroke-width:1px
    classDef fabric fill:#0A1C2E,stroke:#00BCD4,stroke-width:2px,color:#fff
    classDef db fill:#E34F26,stroke:#333,stroke-width:1px,color:#fff
    classDef ipfs fill:#041E42,stroke:#00A2E8,stroke-width:2px,color:#fff

    subgraph SWARM["Docker Swarm Overlay Network (over Tailscale VPN Mesh)"]
        direction TB

        subgraph PC1["PC1 (Ankit): Swarm Master Node"]
            direction TB
            ManagerUI[Manager Portal]:::react
            CA[(Fabric CA)]:::fabric
            Orderer[[Raft Orderer]]:::fabric
            Peer0((Peer 0)):::fabric
            CDB0[(CouchDB 0)]:::db
            
            ManagerUI -. "Register IDs" .-> CA
            Peer0 <--> CDB0
        end

        subgraph PC2["PC2 (Mohit): Worker Node 1"]
            direction TB
            PatientUI[Patient Portal]:::react
            PharmUI[Pharmacist Portal]:::react
            Peer1((Peer 1)):::fabric
            CDB1[(CouchDB 1)]:::db
            
            Peer1 <--> CDB1
        end

        subgraph PC3["PC3 (Ronit): Worker Node 2"]
            direction TB
            InvUI[Inventory Portal]:::react
            API{API Gateway SDK}:::nodejs
            Peer2((Peer 2)):::fabric
            CDB2[(CouchDB 2)]:::db
            
            InvUI -. "Check Stock" .-> API
            PatientUI -. "REST API" .-> API
            PharmUI -. "REST API" .-> API
            ManagerUI -. "REST API" .-> API
            
            Peer2 <--> CDB2
        end

        %% Gossip and Consensus Routing
        Peer0 <== "Gossip Protocol" ==> Peer1
        Peer1 <== "Gossip Protocol" ==> Peer2
        Peer2 <== "Gossip Protocol" ==> Peer0
        
        Peer0 -. "Submit" .-> Orderer
        Peer1 -. "Submit" .-> Orderer
        Peer2 -. "Submit" .-> Orderer
        
        %% API to Peers routing
        API == "gRPC Proposals" === Peer0
        API == "gRPC Proposals" === Peer1
        API == "gRPC Proposals" === Peer2
    end

    %% External Systems
    subgraph EXT["External Off-Chain Systems"]
        IPFS{{IPFS Network Nodes}}:::ipfs
    end

    API -. "Upload/Download Docs" .-> IPFS
    PatientUI -. "Web Download" .-> IPFS

    %% Define class assignments
    class PC1 master
    class PC2 worker
    class PC3 worker
    class SWARM external
```

---

### How to explain this Diagram in your Presentation:

1. **The Boundary Shell (The VPN/Swarm):** Point to the large outer box. Explain that because your laptops are scattered, you created a **Tailscale VPN Mesh** to act as a virtual LAN, allowing Docker Swarm to spin an "Overlay Network" across all machines to encrypt traffic.
2. **The Components on PC1 (Ankit):** Point out how PC1 acts as the "Brain". It holds the **Orderer** (for consensus) and the **Fabric CA** (for identity). It also holds the Manager UI capable of pinging the CA to mint certificates.
3. **The Components on PC2 (Mohit):** Point to PC2. Explain that it holds **Peer1** and its **CouchDB**. It runs the clinical-facing apps (Patient and Pharmacist).
4. **The Gateway Centralization (Ronit's PC3):** Trace the arrows from the 4 React Apps (Manager, Patient, Pharmacist, Inventory). Point out how they ALL route to the green hexagon **(API Gateway)** on PC3. Explain that the Gateway uses the Fabric SDK to change standard REST web-calls into binary `gRPC Proposals` that are securely fired at all three Peers.
5. **The Off-Chain Layer (IPFS):** Look below at the External box. Show how the API connects to IPFS. Explain that large PDFs never touch the internal Fabric Swarm directly. They are pumped into IPFS, and only the cryptographically secure *Hash* payload is sent into the Blockchain.
