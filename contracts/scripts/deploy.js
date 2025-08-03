const hre = require("hardhat");

async function main() {
  const EvidenceRegistry = await hre.ethers.getContractFactory("EvidenceRegistry");
  const contract = await EvidenceRegistry.deploy();

  await contract.waitForDeployment(); // ✅ this replaces contract.deployed()

  console.log("EvidenceRegistry deployed to:", await contract.getAddress()); // ✅ getAddress() instead of contract.address
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
