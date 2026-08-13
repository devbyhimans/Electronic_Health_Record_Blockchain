# Mohit's Deep-Dive: Masterclass on Smart Contracts & Clinical UIs

This document is your ultimate cheat-sheet, Mohit. When the professor asks you hard, highly-technical questions about where the data actually lives, how the rules are enforced, and why the UI prevents access, use these explanations to prove your expertise.

---

## 1. How Chaincode (Smart Contracts) Actually Works

**The Concept:**
A blockchain network by itself just records things. The **Chaincode** (Smart Contract) is the actual "brain" that tells the blockchain *what* it is allowed to record. 

**The Technical Deep-Dive:**
* **Language & Execution:** "I wrote our Smart Contracts in Node.js. In Hyperledger Fabric, the chaincode doesn't run natively inside the peer itself; it runs in an isolated, secure Docker container right next to the peer. This isolation ensures that if a smart contract crashes, it doesn't take down our hospital's entire peer."
* **PutState & GetState:** "The core functions I heavily utilized from the Fabric SDK are `putState()` and `getState()`. When the UI sends me a new patient, my chaincode package receives it, validates the logic (e.g., making sure they don't already exist), converts the JSON data into a buffer, and calls `ctx.stub.putState()`. This is what actually forces the peer to write the data to the ledger."

---

## 2. Why CouchDB? (The State Database)

If the professor asks: *"Why did you use CouchDB instead of the default database?"*

**The Problem:**
Hyperledger Fabric's default database is `LevelDB`. LevelDB is an incredibly fast, basic Key-Value store. But it is "dumb"—it only knows how to search by exact IDs. If a doctor asked the React UI to "Show me ALL patients over the age of 50 who have asthma," LevelDB literally cannot do that without downloading every single patient on the blockchain and filtering it manually, which is impossibly slow.

**The Solution: CouchDB:**
* **Rich Queries:** "I configured my peer (PC2) to use **CouchDB** as the State Database. CouchDB stores our patient data as rich JSON documents. This allowed me to write 'Rich Queries' (Mango Queries) directly in my chaincode. Now, my chaincode can tell CouchDB: `SELECT * WHERE diagnosis == 'asthma'` and it returns instantly. Without CouchDB, my Pharmacist frontend dashboard would be incredibly sluggish when searching for open prescriptions."

---

## 3. Off-Chain Storage: IPFS (InterPlanetary File System)

If asked: *"Where are the heavy medical reports and PDFs stored? Are they inside the blocks?"*

**The Problem with Blockchain Storage:**
"Putting large PDFs or medical scans directly into a blockchain block is a terrible architecture. It bloats the blockchain permanently, causing computers to run out of hard drive space and slowing down the network."

**The Solution: IPFS Integration:**
* **The Flow:** "I utilized **Off-Chain Storage** using IPFS. When a doctor uploads a heavy medical scan on my Patient portal, it does NOT go to the Fabric chaincode. Instead, my UI routes it to our IPFS nodes."
* **The Hash:** "IPFS uses 'Content Addressing'. It takes the file, stores it, and returns a unique cryptographic Hash (like `Qm123abcd...`). Then, I take *only that tiny hash string* and send it to my Chaincode. The Fabric ledger only permanently stores the Hash. If a patient wants their file later, my UI reads the Hash from the ledger, asks IPFS for that exact Hash, and downloads the file securely."

---

## 4. Frontend Privacy (Attribute-Based Access Control)

If asked: *"How do you prove the Pharmacist can't steal or view the Patient's primary medical illnesses?"*

**The Security Model:**
* "I designed the frontend portals heavily around **ABAC (Attribute-Based Access Control)**. Unlike normal websites that use cookies or a database of passwords, my React apps rely on the X.509 Cryptographic Certificates that Ankit's Manager portal issued to the users."
* "Because the certificates are cryptographically checked by my chaincode, the pharmacist physically cannot bypass the database to see an illness. When the pharmacist's UI asks the network for a prescription to bill, my chaincode checks if that identity is enrolled as a 'pharmacist'. It then returns *only* the medicine name and quantity to the React UI. It strips the primary diagnosis out at the blockchain level before it ever reaches the browser."
