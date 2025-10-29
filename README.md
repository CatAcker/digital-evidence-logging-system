# BlockCoC: Blockchain-Based Digital Evidence Chain of Custody

**BlockCoC** is a blockchain-based prototype that ensures the integrity and authenticity of digital evidence through cryptographic verification and zero-knowledge proofs (zkSNARKs).
It provides a transparent, privacy-preserving system to record, verify, and audit the chain of custody for digital evidence — supporting forensic integrity and admissibility in court.

---

## Features

- **Smart Contracts (Solidity + Hardhat)** 
  Implements an `EvidenceRegistry` contract for evidence submission, verification, and timestamping.

- **Zero-Knowledge Proofs (ZoKrates)** 
  Validates the authenticity of evidence without revealing its contents.

- **Cryptographic Hashing (Keccak-256)**
  Generates tamper-proof digital fingerprints of evidence files.

- **Frontend (React + Ethers.js)**
  Provides a user-friendly interface for submitting evidence, generating proofs, and verifying authenticity via MetaMask.

- **Backend Integration (Node.js + Express)**
  Handles ZoKrates proof generation and interacts with the blockchain for verification.

- **Event Logging & Provenance Tracking**
  Every submission and verification event is permanently recorded on-chain.

---

## System Architecture

```
+---------------------------+
|      Frontend (React)     |
|  - MetaMask Integration   |
|  - Evidence Upload UI     |
+-------------+-------------+
              |
              v
+---------------------------+
|   Backend (Node + ZoKrates) |
|  - Hashing & Proof Gen     |
|  - IPFS/Local Storage (opt)|
+-------------+-------------+
              |
              v
+---------------------------+
|  Ethereum (Smart Contract)|
|  - EvidenceRegistry.sol   |
|  - Timestamps & Events    |
+---------------------------+
```

---

## Tech Stack

| Layer | Technologies |
|-------|---------------|
| Blockchain | Ethereum (Hardhat), Solidity |
| ZKP | ZoKrates |
| Frontend | React, Ethers.js, Tailwind |
| Backend | Node.js, Express |
| Hashing | Keccak-256 (via ethers.utils) |
| Storage | Local / Optional IPFS |

---

## Prototype Tests

Prototype testing simulated:
- Evidence submission and proof verification on a **local Ethereum testnet**.
- Smart contract event logging for auditability.
- Chain-of-custody reconstruction using transaction timestamps.
- ZKP validation to preserve evidence confidentiality.

---

## Setup & Installation

### Clone the repository
```bash
git clone https://github.com/<your-username>/BlockCoC.git
cd BlockCoC
```

### Install dependencies
```bash
npm install
```

### Start local Ethereum node (Hardhat)
```bash
npx hardhat node
```

### Deploy the smart contract
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### Run ZoKrates proof generation service
```bash
cd zokrates
zokrates compile -i square.code
zokrates setup
zokrates compute-witness -a <inputs>
zokrates generate-proof
zokrates export-verifier
```

### Launch the frontend
```bash
npm start
```

Then open **http://localhost:3000** in your browser.

---

## MetaMask Setup & Wallet Connection

### 1) Install and set up MetaMask
- Install the browser extension from an official store.
- Create a wallet (or use a test wallet). **Never** use real funds on local/test networks.

### 2) Add the Hardhat local network (chainId `31337`)
When you run `npx hardhat node`, Hardhat exposes a local JSON-RPC at `http://127.0.0.1:8545` with chainId **31337**.

In MetaMask → **Networks** → **Add network manually**:
- **Network name:** Hardhat (Localhost)
- **RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `31337`
- **Currency symbol:** ETH
- **Block explorer URL:** (leave empty)

> Tip: Hardhat prints 20 test accounts + private keys in the terminal. You can **Import account** in MetaMask with one of those private keys to get ETH on the local chain immediately.

### 3) Environment variables
```
# .env (React)
REACT_APP_RPC_URL=http://127.0.0.1:8545
```

### 4) Common issues & fixes
- **`MetaMask not found`** → Install the extension or use a supported browser.
- **`connection rejected (code 4001)`** → User canceled the connect/tx prompt; try again.
- **No ETH on local** → Import one of the Hardhat accounts printed in the `npx hardhat node` output.
- **Contract address mismatch** → After redeploying, make sure your frontend `abis/addresses.json` is updated.

## Project Structure

```
contracts
  artifacts
    build-info
    contracts
  cache
    solidity-files-cache.json
  contracts
    EvidenceRegistry.sol
    Lock.sol
    verifier.sol
  fe
    src
  ignition
    modules
  node_modules
  scripts
    deploy.js
    testSubmit.js
    verify-proof-file.js
  test
    Lock.js
  zokrates
    abi.json
    commitment.zok
    out
    out.r1cs
    out.wtns
    proof.json
    proving.key
    verification.key
    verifier.sol
    witness
  .gitignore
  hardhat.config.js
  package-lock.json
  package.json
  README.md
fe
  build
  node_modules
  public
  server
  src
    abis
    ├── addresses.json
    ├── EvidenceRegistry.json
    └── Verifier.json
    components
    ├── evidence-form.css
    ├── evidence-list.css
    ├── evidence-verify.css
    ├── EvidenceForm.js
    ├── EvidenceList.js
    └── EvidenceVerify.js
    App.css
    App.js
    App.test.js
    index.css
    index.js
    logo.svg
    reportWebVitals.js
    setupTests.js
  .env
  .gitignore
  package-lock.json
  package.json
  README.md
```
---

## Author
**Catherina Ackerman**  
South Africa  
u24076491@tuks.co.za

**Catherina Ackerman**  
📍 South Africa  
u24076491@tuks.co.za
