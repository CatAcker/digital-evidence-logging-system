import { useState } from "react";
import { ethers, toBigInt } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // update on redeploy

async function keccak256File(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf)); // 0x-prefixed hex
}

export default function EvidenceForm() {
  const [secret, setSecret] = useState("");              // e.g. "42"
  const [metadata, setMetadata] = useState("");          // human note
  const [proofFile, setProofFile] = useState(null);      // ZoKrates proof.json
  const [evidenceFile, setEvidenceFile] = useState(null);// file to hash
  const [storeMode, setStoreMode] = useState("file");    // 'file' | 'commitment'
  const [submitting, setSubmitting] = useState(false);

  const handleProofUpload = (e) => setProofFile(e.target.files?.[0] || null);
  const handleEvidenceUpload = (e) => setEvidenceFile(e.target.files?.[0] || null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!window.ethereum) return alert("Please install MetaMask");
      if (!proofFile)       return alert("Upload ZoKrates proof.json");
      if (secret.trim() === "") return alert("Enter the ZoKrates secret (e.g., 42)");
      if (storeMode === "file" && !evidenceFile) return alert("Choose an evidence file");

      setSubmitting(true);

      // 1) Compute commitment = secret * 12345 (must match your ZoKrates public input)
      const secretBig = toBigInt(secret);
      const commitmentBig = secretBig * 12345n;
      const commitmentStr = commitmentBig.toString();

      // 2) If storing the file hash, compute Keccak-256 of the chosen file
      let fileHashHex = null;
      if (storeMode === "file") {
        fileHashHex = await keccak256File(evidenceFile);
      }

      // 3) Parse proof.json and build verifier struct + inputs
      const text = await proofFile.text();
      const json = JSON.parse(text);

      const proof = {
        a: { X: toBigInt(json.proof.a[0]), Y: toBigInt(json.proof.a[1]) },
        b: {
          X: [toBigInt(json.proof.b[0][0]), toBigInt(json.proof.b[0][1])],
          Y: [toBigInt(json.proof.b[1][0]), toBigInt(json.proof.b[1][1])],
        },
        c: { X: toBigInt(json.proof.c[0]), Y: toBigInt(json.proof.c[1]) },
      };
      const inputs = (json.inputs || []).map((v) => toBigInt(v));

      if (inputs.length !== 1) {
        alert(`Expected 1 public input, got ${inputs.length}.`);
        return;
      }
      if (inputs[0] !== commitmentBig) {
        console.error("Expected commitment:", commitmentBig.toString());
        console.error("Proof input:", inputs[0].toString());
        alert("Commitment mismatch! Ensure secret matches the proof.json you uploaded.");
        return;
      }

      // 4) Decide what to store in the contract's 'hash' field
      //    file mode -> evidence file's Keccak-256 hex
      //    commitment mode -> numeric commitment (decimal string)
      const onChainHash = storeMode === "file" ? fileHashHex : commitmentStr;

      // 5) Send the transaction
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

      const tx = await contract.submitEvidenceWithProof(
        onChainHash,
        metadata,
        proof,
        inputs
      );
      await tx.wait();

      alert("✅ ZK-verified evidence submitted!");
      setSecret(""); setMetadata(""); setProofFile(null); setEvidenceFile(null);
    } catch (err) {
      console.error("❌ Submission failed:", err);
      alert("Transaction failed. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 600 }}>ZoKrates secret (for commitment)</label>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*"
        placeholder="Secret (e.g. 42)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
      />

      <label style={{ fontWeight: 600 }}>Metadata</label>
      <input
        type="text"
        placeholder="Metadata (e.g., filename, description)"
        value={metadata}
        onChange={(e) => setMetadata(e.target.value)}
        required
      />

      <label style={{ fontWeight: 600 }}>Store as</label>
      <div style={{ display: "flex", gap: 12 }}>
        <label>
          <input
            type="radio"
            name="mode"
            value="file"
            checked={storeMode === "file"}
            onChange={() => setStoreMode("file")}
          />{" "}
          File Keccak-256 (recommended)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="commitment"
            checked={storeMode === "commitment"}
            onChange={() => setStoreMode("commitment")}
          />{" "}
          Numeric commitment (demo)
        </label>
      </div>

      {storeMode === "file" && (
        <>
          <label style={{ fontWeight: 600 }}>Evidence file (to hash & store)</label>
          <input type="file" onChange={handleEvidenceUpload} />
        </>
      )}

      <label style={{ fontWeight: 600 }}>ZoKrates proof.json</label>
      <input type="file" accept=".json" onChange={handleProofUpload} required />

      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit with ZK Proof"}
      </button>

      {storeMode === "file" && (
        <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>
          Tip: Later, use “Verify” to re-hash your file and compare with the latest on-chain record.
        </p>
      )}
    </form>
  );
}
