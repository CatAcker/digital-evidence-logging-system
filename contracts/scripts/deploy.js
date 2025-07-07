const hre = require("hardhat");

async function main() {
  const Evidence = await hre.ethers.getContractFactory("EvidenceRegistry");
  const evidence = await Evidence.deploy(); // This already deploys it!

  console.log(`Contract deployed to: ${evidence.target}`); // Use .target instead of .address
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
