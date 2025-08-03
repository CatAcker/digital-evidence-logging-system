const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt("EvidenceRegistry", "<DEPLOYED_ADDRESS>");

  const proofJson = JSON.parse(fs.readFileSync("./proof.json", "utf8"));

  const proof = {
    a: proofJson.proof.a,
    b: proofJson.proof.b,
    c: proofJson.proof.c,
  };
  const input = proofJson.inputs.map(BigInt);

  const tx = await contract.connect(signer).submitEvidenceWithProof("518490", "test data", proof, input);
  await tx.wait();
  console.log("Submitted successfully");
}

main().catch(console.error);
