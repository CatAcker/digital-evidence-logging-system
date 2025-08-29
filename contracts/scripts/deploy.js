// contracts/scripts/deploy.js
// Run: npx hardhat run scripts/deploy.js --network localhost
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function firstExistingDir(cands, fallback) {
  for (const d of cands) { try { if (fs.existsSync(d) && fs.statSync(d).isDirectory()) return d; } catch {}
  } return fallback;
}
function copyAbi(rel, outDir) {
  const src = path.resolve(__dirname, "..", "artifacts", "contracts", rel);
  if (!fs.existsSync(src)) throw new Error(`ABI not found at ${src}. Did you run "npx hardhat compile"?`);
  const dest = path.join(outDir, path.basename(src));
  fs.copyFileSync(src, dest);
  console.log("Copied ABI ->", dest);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1) Verifier (exported by ZoKrates)
  const Verifier = await hre.ethers.getContractFactory("Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  const verRcpt = await verifier.deploymentTransaction().wait();
  console.log("Verifier:", verifierAddr, "block:", verRcpt.blockNumber);

  // 2) EvidenceRegistry – detect constructor shape
  const EvidenceRegistry = await hre.ethers.getContractFactory("EvidenceRegistry");
  const ctor = EvidenceRegistry.interface.fragments.find(f => f.type === "constructor");
  const ctorInputs = ctor?.inputs ?? [];
  console.log("EvidenceRegistry ctor inputs:", ctorInputs.map(i => i.type).join(", ") || "(none)");

  let registry;
  if (ctorInputs.length === 1 && ctorInputs[0].type === "address") {
    // constructor(address verifier)
    registry = await EvidenceRegistry.deploy(verifierAddr);
  } else if (ctorInputs.length === 0) {
    // constructor(); deploy then try setVerifier/initialize if they exist
    registry = await EvidenceRegistry.deploy();
    await registry.waitForDeployment();
    if (registry.setVerifier) {
      console.log("Calling setVerifier(", verifierAddr, ")");
      const tx = await registry.setVerifier(verifierAddr);
      await tx.wait();
    } else if (registry.initialize) {
      console.log("Calling initialize(", verifierAddr, ")");
      const tx = await registry.initialize(verifierAddr);
      await tx.wait();
    } else {
      console.warn("No setVerifier/initialize found; ensure your registry can reach the verifier.");
    }
  } else {
    throw new Error(`Unrecognized EvidenceRegistry constructor: (${ctorInputs.map(i=>i.type).join(", ")})`);
  }

  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  const regRcpt = await registry.deploymentTransaction().wait();
  console.log("EvidenceRegistry:", registryAddr, "block:", regRcpt.blockNumber);

  // 3) Write FE addresses + ABIs
  const feAbisDir = firstExistingDir(
    [
      path.resolve(__dirname, "..", "fe", "src", "abis"),
      path.resolve(__dirname, "..", "frontend", "src", "abis"),
      path.resolve(__dirname, "..", "..", "fe", "src", "abis"),
      path.resolve(__dirname, "..", "..", "frontend", "src", "abis"),
    ],
    path.resolve(__dirname, "..", "fe", "src", "abis")
  );
  ensureDir(feAbisDir);

  const addressesPath = path.join(feAbisDir, "addresses.json");
  const addresses = {
    EvidenceRegistry: registryAddr,
    Verifier: verifierAddr,
    DEPLOY_BLOCK: regRcpt.blockNumber,
  };
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("Wrote", addressesPath, addresses);

  // 4) Copy ABIs used by FE (adjust filenames if yours differ)
  copyAbi(path.join("EvidenceRegistry.sol", "EvidenceRegistry.json"), feAbisDir);
  // Your Verifier path may be "verifier.sol" or "Verifier.sol" depending on filename casing
  const cand = [
    path.join("verifier.sol", "Verifier.json"),
    path.join("Verifier.sol", "Verifier.json"),
  ];
  let copied = false;
  for (const rel of cand) {
    try { copyAbi(rel, feAbisDir); copied = true; break; } catch {}
  }
  if (!copied) console.warn("Could not find Verifier.json in artifacts. Check filename/casing.");

  console.log("\n✅ Deploy complete.");
  console.log("FE .env (optional):");
  console.log("REACT_APP_RPC_URL=http://127.0.0.1:8545");
  console.log(`REACT_APP_DEPLOY_BLOCK=${regRcpt.blockNumber}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
