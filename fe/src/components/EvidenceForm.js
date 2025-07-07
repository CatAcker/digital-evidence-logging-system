import React, { useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";

const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // your deployed address

export default function EvidenceForm() {
  const [hash, setHash] = useState("");
  const [metadata, setMetadata] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!window.ethereum) {
        alert("Please install MetaMask");
        return;
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, EvidenceRegistry, signer);
      const tx = await contract.submitEvidence(hash, metadata);
      await tx.wait();

      alert("Evidence submitted successfully!");
    } catch (err) {
      console.error(err);
      alert("Transaction failed.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="SHA-256 or Keccak256 hash"
        value={hash}
        onChange={(e) => setHash(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Metadata (description, filename, etc.)"
        value={metadata}
        onChange={(e) => setMetadata(e.target.value)}
        required
      />
      <button type="submit">Submit Evidence</button>
    </form>
  );
}
