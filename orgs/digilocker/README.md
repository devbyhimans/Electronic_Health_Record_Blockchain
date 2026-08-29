# Digilocker Module

This module is designed to securely anchor patient files on the blockchain and store the actual encrypted files on IPFS.

## Intended Design

1. **Hashing:** The uploaded file is hashed using SHA-256 on the client or backend before upload.
2. **IPFS Storage:** The file is then uploaded to IPFS. Currently, IPFS files in other modules are stored unencrypted. **This module must fix this gap by ensuring files are encrypted before being uploaded to IPFS.**
3. **On-Chain Anchoring:** The file's hash, its resulting IPFS CID, and any relevant metadata (e.g., patient ID, timestamp, encryption key reference) are stored on the Hyperledger Fabric ledger via smart contracts.
4. **Verification:** When retrieving a file, the system fetches it from IPFS, decrypts it, re-hashes it, and compares it to the on-chain hash to verify its integrity and authenticity.

## Folder Structure

- `chaincode/`: Will contain the Hyperledger Fabric smart contracts for storing and verifying metadata.
- `backend/`: Will contain the API gateway for handling uploads, encryption, IPFS integration, and chaincode invocation.
- `frontend/`: Will contain the user interface for patients or doctors to upload and view their secured documents.
