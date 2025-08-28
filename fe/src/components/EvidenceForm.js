import { useState } from "react";
import { ethers, toBigInt as toBig } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = addresses.EvidenceRegistry; // written by your deploy script

console.log("Using EvidenceRegistry at", CONTRACT_ADDRESS);

const toBytes32 = (x) => ethers.zeroPadValue(ethers.toBeHex(x), 32);

async function keccak256File(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf)); // "0x" + 64 hex
}

export default function EvidenceForm() {
  const [secret, setSecret] = useState("");               // e.g. "42"
  const [metadata, setMetadata] = useState("");           // free-form note
  const [proofFile, setProofFile] = useState(null);       // ZoKrates proof.json
  const [evidenceFile, setEvidenceFile] = useState(null); // file to hash (file mode)
  const [storeMode, setStoreMode] = useState("file");     // 'file' | 'commitment'
  const [submitting, setSubmitting] = useState(false);

  const handleProofUpload = (e) => setProofFile(e.target.files?.[0] || null);
  const handleEvidenceUpload = (e) => setEvidenceFile(e.target.files?.[0] || null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!window.ethereum) return alert("Please install MetaMask");
      if (!proofFile) return alert("Upload ZoKrates proof.json");
      if (secret.trim() === "") return alert("Enter the ZoKrates secret (e.g., 42)");
      if (storeMode === "file" && !evidenceFile) return alert("Choose an evidence file");
      setSubmitting(true);

      // ---- connect & guards
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const { chainId } = await provider.getNetwork();
      console.log("signer", signer, "on chain", chainId);
      if (chainId !== 31337n) {
        alert(`Wrong network: select localhost 31337 (current ${chainId.toString()}).`);
        return;
      }
      const code = await provider.getCode(CONTRACT_ADDRESS);
      console.log("Contract code:", code);
      if (!code || code === "0x") {
        alert(`No contract at ${CONTRACT_ADDRESS}. Redeploy & restart FE.`);
        return;
      }

      // ---- commitment = secret * 12345 (must match circuit public input)
      const commitmentBig = toBig(secret) * 12345n;

      // ---- what to store as first param (ABI says "string")
      // file mode: store keccak(file) as 0x-hex string
      // commitment mode: store decimal string "518490" (contract expects string)
      let onChainHash;
      if (storeMode === "file") {
        onChainHash = await keccak256File(evidenceFile);           // hex string
      } else {
        // You *could* store bytes32, but your ABI says string; store decimal for clarity
        onChainHash = commitmentBig.toString();                    // decimal string
        // If you prefer hex bytes32 string instead, do this:
        // onChainHash = toBytes32(commitmentBig); // hex string "0x...66"
      }

      // ---- parse proof.json -> tuple [a, [[b00,b01],[b10,b11]], c] and uint256[] inputs
      const text = await proofFile.text();
      const json = JSON.parse(text);

      const a = [toBig(json.proof.a[0]), toBig(json.proof.a[1])];
      const b = [
        [toBig(json.proof.b[0][0]), toBig(json.proof.b[0][1])],
        [toBig(json.proof.b[1][0]), toBig(json.proof.b[1][1])],
      ];
      const c = [toBig(json.proof.c[0]), toBig(json.proof.c[1])];
      const proofTuple = [a, b, c];

      const inputsDyn = (json.inputs || []).map((v) => toBig(v));  // uint256[]
      if (inputsDyn.length < 1) {
        alert(`Expected at least 1 public input, got ${inputsDyn.length}.`);
        return;
      }
      // ensure first input equals commitment
      if (inputsDyn[0] !== commitmentBig) {
        alert("Commitment mismatch: typed secret doesn’t match proof.json.");
        return;
      }
      const inputs = inputsDyn; // contract takes uint256[] in your ABI

      // ---- build contract & detect signature
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
      const fn = contract.interface.getFunction("submitEvidenceWithProof");
      const ins = fn.inputs.map((i) => i.type); // e.g. ["string","string","tuple","uint256[]"]

      // Accept either:
      // - string, string, tuple, uint256[]
      // - string, string, tuple, uint256[1]   (older build)
      const isTupleForm =
        ins.length === 4 &&
        ins[0] === "string" &&
        ins[1] === "string" &&
        ins[2].startsWith("tuple") &&
        (ins[3] === "uint256[]" || ins[3] === "uint256[1]");

      // Inline style (rare) for completeness:
      const isInlineForm =
        ins.length === 6 &&
        ins[0] === "string" &&
        ins[1] === "string" &&
        ins[2] === "uint256[2]" &&
        ins[3] === "uint256[2][2]" &&
        ins[4] === "uint256[2]" &&
        (ins[5] === "uint256[]" || ins[5] === "uint256[1]");

      // ---- preflight (ethers v6) with staticCall to catch reverts early
      try {
        if (isTupleForm) {
          await contract.submitEvidenceWithProof.staticCall(onChainHash, metadata, proofTuple, inputs);
        } else if (isInlineForm) {
          await contract.submitEvidenceWithProof.staticCall(onChainHash, metadata, a, b, c, inputs);
        } else {
          throw new Error(`Unrecognized signature: ${ins.join(", ")}`);
        }
      } catch (simErr) {
        const raw = simErr?.data ?? simErr?.info?.error?.data;
        try {
          const parsed = new ethers.Interface(abi).parseError(raw);
          alert(`Simulation reverted: ${parsed.name}`);
        } catch {
          alert(simErr?.reason || simErr?.shortMessage || simErr?.message || "Simulation reverted.");
        }
        console.error("staticCall revert:", simErr);
        return;
      }

      // ---- send tx (same shape as simulate)
      const tx = isTupleForm
        ? await contract.submitEvidenceWithProof(onChainHash, metadata, proofTuple, inputs)
        : await contract.submitEvidenceWithProof(onChainHash, metadata, a, b, c, inputs);

      await tx.wait();
      alert("✅ ZK-verified evidence submitted!");
      setSecret(""); setMetadata(""); setProofFile(null); setEvidenceFile(null);
    } catch (err) {
      console.error("❌ Submission failed:", err);
      alert(err?.reason || err?.shortMessage || err?.message || "Transaction failed. See console.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 600 }}>ZoKrates secret (for commitment)</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
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
          Numeric commitment (stored as string)
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
    </form>
  );
}
