import { toBigInt } from "ethers";
import { useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Update if redeployed

export default function EvidenceForm() {
  const [secret, setSecret] = useState(""); // new field
  const [metadata, setMetadata] = useState("");
  const [proofFile, setProofFile] = useState(null);

  const handleProofUpload = (e) => {
    const file = e.target.files[0];
    setProofFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!window.ethereum) {
        alert("Please install MetaMask");
        return;
      }

      if (!proofFile) {
        alert("Please upload a ZoKrates proof.json file.");
        return;
      }

      const commitment = (toBigInt(secret) * 12345n).toString();
      // Read and parse the uploaded proof.json
      const text = await proofFile.text();
      const json = JSON.parse(text);

      const proof = {
        a: {
          X: toBigInt(json.proof.a[0]),
          Y: toBigInt(json.proof.a[1]),
        },
        b: {
          X: [toBigInt(json.proof.b[0][0]), toBigInt(json.proof.b[0][1])],
          Y: [toBigInt(json.proof.b[1][0]), toBigInt(json.proof.b[1][1])],
        },
        c: {
          X: toBigInt(json.proof.c[0]),
          Y: toBigInt(json.proof.c[1]),
        },
      };

      const inputs = json.inputs.map((input) => toBigInt(input));

      console.log("inputs:", inputs);
      console.log("computed commitment:", toBigInt(secret) * 12345n);

      if (inputs[0] !== toBigInt(commitment)) {
        alert("Commitment mismatch! Make sure secret and proof.json match.");
        console.error("Expected commitment:", commitment);
        console.error("Proof input:", inputs[0].toString());
        return;
      }

      // Connect to Ethereum
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      console.log("Submitting with:", {
        commitment,
        metadata,
        proof,
        inputs,
      });

      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

      console.log("Submitting proof with values:");
      console.log("Commitment (hash):", commitment);
      console.log("Metadata:", metadata);
      console.log("Inputs:", inputs);
      console.log("Proof:", proof);

      const tx = await contract.submitEvidenceWithProof(
        commitment,
        metadata,
        proof,
        inputs
      );
      await tx.wait();

      alert("✅ ZK-verified evidence submitted!");
    } catch (err) {
      console.error("❌ Submission failed:", err);
      alert("Transaction failed. Check console for details.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        placeholder="Secret (e.g. 42)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Metadata (e.g. filename)"
        value={metadata}
        onChange={(e) => setMetadata(e.target.value)}
        required
      />
      <input type="file" accept=".json" onChange={handleProofUpload} required />
      <button type="submit">Submit with ZK Proof</button>
    </form>
  );
}
