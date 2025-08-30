import { useState } from "react";
import { ethers, toBigInt as toBig } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";
import "./evidence-form.css";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = addresses.EvidenceRegistry;

const SERVER_BASE_RAW = (process.env.REACT_APP_HELPER_URL || "").trim();
const SERVER_BASE = SERVER_BASE_RAW.replace(/\/$/, "");
const UPLOAD_URL = SERVER_BASE ? `${SERVER_BASE}/upload` : "/upload";
console.log("UPLOAD_URL =", UPLOAD_URL);

async function keccak256File(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf));
}

async function uploadEvidenceFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Upload failed ${res.status}: ${text || "(no response body)"}`
    );
  return JSON.parse(text);
}

export default function EvidenceForm() {
  const [secret, setSecret] = useState("");
  const [metadata, setMetadata] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleProofUpload = (e) => setProofFile(e.target.files?.[0] || null);
  const handleEvidenceUpload = (e) =>
    setEvidenceFile(e.target.files?.[0] || null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!window.ethereum) return alert("Please install MetaMask");
      if (!proofFile) return alert("Upload ZoKrates proof.json");
      if (!evidenceFile) return alert("Choose an evidence file");
      if (secret.trim() === "")
        return alert("Enter the ZoKrates secret (e.g., 42)");
      setSubmitting(true);

      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const { chainId } = await provider.getNetwork();
      if (chainId !== 31337n) {
        alert(
          `Wrong network: select localhost 31337 (current ${chainId.toString()}).`
        );
        return;
      }
      const code = await provider.getCode(CONTRACT_ADDRESS);
      if (!code || code === "0x") {
        alert(
          `No contract at ${CONTRACT_ADDRESS}. Redeploy or update addresses.json.`
        );
        return;
      }

      const commitmentBig = toBig(secret) * 12345n;
      const localKeccak = await keccak256File(evidenceFile);

      const up = await uploadEvidenceFile(evidenceFile);
      const fileUrl = SERVER_BASE ? `${SERVER_BASE}${up.url}` : up.url;

      const onChainHash = up.keccak256 || localKeccak;
      const metadataJson = JSON.stringify({ note: metadata, fileUrl });

      const proofText = await proofFile.text();
      const json = JSON.parse(proofText);

      const a = [toBig(json.proof.a[0]), toBig(json.proof.a[1])];
      const b = [
        [toBig(json.proof.b[0][0]), toBig(json.proof.b[0][1])],
        [toBig(json.proof.b[1][0]), toBig(json.proof.b[1][1])],
      ];
      const c = [toBig(json.proof.c[0]), toBig(json.proof.c[1])];
      const proofTuple = [a, b, c];

      const inputsDyn = (json.inputs || []).map((v) => toBig(v));
      if (inputsDyn.length < 1) {
        alert(`Expected at least 1 public input, got ${inputsDyn.length}.`);
        return;
      }
      if (inputsDyn[0] !== commitmentBig) {
        alert("Commitment mismatch: typed secret doesn’t match proof.json.");
        return;
      }
      const inputs = inputsDyn;

      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
      const fn = contract.interface.getFunction("submitEvidenceWithProof");
      const ins = fn.inputs.map((i) => i.type);

      const isTupleForm =
        ins.length === 4 &&
        ins[0] === "string" &&
        ins[1] === "string" &&
        ins[2].startsWith("tuple") &&
        (ins[3] === "uint256[]" || ins[3] === "uint256[1]");

      const isInlineForm =
        ins.length === 6 &&
        ins[0] === "string" &&
        ins[1] === "string" &&
        ins[2] === "uint256[2]" &&
        ins[3] === "uint256[2][2]" &&
        ins[4] === "uint256[2]" &&
        (ins[5] === "uint256[]" || ins[5] === "uint256[1]");

      try {
        if (isTupleForm) {
          await contract.submitEvidenceWithProof.staticCall(
            onChainHash,
            metadataJson,
            proofTuple,
            inputs
          );
        } else if (isInlineForm) {
          await contract.submitEvidenceWithProof.staticCall(
            onChainHash,
            metadataJson,
            a,
            b,
            c,
            inputs
          );
        } else {
          throw new Error(`Unrecognized V1 signature: ${ins.join(", ")}`);
        }
      } catch (simErr) {
        console.error("staticCall revert:", simErr);
        const raw = simErr?.data ?? simErr?.info?.error?.data;
        try {
          const parsed = new ethers.Interface(abi).parseError(raw);
          alert(`Simulation reverted: ${parsed.name}`);
        } catch {
          alert(
            simErr?.reason ||
              simErr?.shortMessage ||
              simErr?.message ||
              "Simulation reverted."
          );
        }
        return;
      }

      const tx = isTupleForm
        ? await contract.submitEvidenceWithProof(
            onChainHash,
            metadataJson,
            proofTuple,
            inputs
          )
        : await contract.submitEvidenceWithProof(
            onChainHash,
            metadataJson,
            a,
            b,
            c,
            inputs
          );

      await tx.wait();
      alert("✅ Evidence submitted (file saved & URL in metadata)!");
      setSecret("");
      setMetadata("");
      setProofFile(null);
      setEvidenceFile(null);
    } catch (err) {
      console.error("❌ Submission failed:", err);
      alert(
        err?.reason ||
          err?.shortMessage ||
          err?.message ||
          "Transaction failed. See console."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="evf">
      <label>ZoKrates secret (for commitment)</label>
      <input
        className="ph-muted"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Secret (e.g., 42)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
      />

      <label>Metadata note</label>
      <input
        className="ph-muted"
        type="text"
        placeholder="Short note (stored inside on-chain metadata JSON)"
        value={metadata}
        onChange={(e) => setMetadata(e.target.value)}
        required
      />

      <label>Evidence file (saved & hashed)</label>
      <input type="file" onChange={handleEvidenceUpload} required />

      <label>ZoKrates proof.json</label>
      <input type="file" accept=".json" onChange={handleProofUpload} required />

      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit with ZK Proof"}
      </button>
    </form>
  );
}
