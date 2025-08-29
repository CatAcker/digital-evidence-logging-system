// node scripts/verify-proof-file.js <verifierAddress> <path/to/proof.json> [rpc]
// ex: node scripts/verify-proof-file.js 0x... .\zokrates\proof.json
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// Load Verifier ABI (from FE first, then artifacts)
function loadVerifierAbi() {
  const tries = [
    path.resolve(__dirname, "../fe/src/abis/Verifier.json"),
    path.resolve(__dirname, "../frontend/src/abis/Verifier.json"),
  ];
  for (const p of tries) {
    if (fs.existsSync(p)) {
      const j = require(p);
      if (j?.abi) return { abi: j.abi, source: p };
    }
  }
  const root = path.resolve(__dirname, "../artifacts/contracts");
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (name === "Verifier.json") {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        return { abi: j.abi, source: p };
      }
    }
  }
  throw new Error("Could not find Verifier.json ABI");
}

function toBig(x){ return typeof x === "bigint" ? x : BigInt(x); }

(async () => {
  try {
    const [addr, proofPathArg, rpcArg] = process.argv.slice(2);
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr || "")) {
      console.error("Usage: node scripts/verify-proof-file.js <verifierAddress> <proof.json> [rpc]");
      process.exit(1);
    }

    const proofPath = path.resolve(proofPathArg || "");
    if (!fs.existsSync(proofPath)) {
      console.error("❌ proof.json not found at:", proofPath);
      process.exit(1);
    }
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

    const a = [toBig(proof.proof.a[0]), toBig(proof.proof.a[1])];
    const b = [
      [toBig(proof.proof.b[0][0]), toBig(proof.proof.b[0][1])],
      [toBig(proof.proof.b[1][0]), toBig(proof.proof.b[1][1])],
    ];
    const c = [toBig(proof.proof.c[0]), toBig(proof.proof.c[1])];
    const input = (proof.inputs || []).map(toBig);
    const bSwapped = [b[1], b[0]];

    console.log("→ verifier address:", addr);
    console.log("→ proof file:", proofPath);
    console.log("→ input(s):", input.map(String));

    const { abi, source } = loadVerifierAbi();
    console.log("→ using ABI:", source);

    const provider = new ethers.JsonRpcProvider(rpcArg || "http://127.0.0.1:8545");
    const code = await provider.getCode(addr);
    if (code === "0x") {
      console.error("❌ No contract code at that address (wrong network or address).");
      process.exit(1);
    }

    const ver = new ethers.Contract(addr, abi, provider);
    const fns = ver.interface.fragments.filter(f => f.type === "function" && /^verify/i.test(f.name));
    if (fns.length === 0) {
      console.error("❌ ABI has no verify* function.");
      process.exit(1);
    }
    // Prefer verifyTx if present
    const vFn = fns.find(f => f.name === "verifyTx") || fns[0];
    const sig = vFn.inputs.map(i => i.type).join(", ");
    console.log(`→ selected function: ${vFn.name}(${sig})`);

    const isTupleFirst = vFn.inputs.length === 2 && vFn.inputs[0].type.startsWith("tuple");
    const isInlineGroth = sig.includes("uint256[2],uint256[2][2],uint256[2]");

    if (!(isTupleFirst || isInlineGroth)) {
      console.error("❌ Unsupported verify* signature. Expected tuple-first or inline groth16 style.");
      process.exit(1);
    }

    async function call(useSwap) {
      const bArg = useSwap ? bSwapped : b;
      if (isTupleFirst) return await ver[vFn.name]([a, bArg, c], input);
      return await ver[vFn.name](a, bArg, c, input);
    }

    try {
      const ok1 = await call(false);
      console.log("verify (normal b):", ok1);
      if (ok1 === true) process.exit(0);
    } catch (e) {
      console.log("verify (normal b) threw:", e.shortMessage || e.message);
    }
    try {
      const ok2 = await call(true);
      console.log("verify (swapped b):", ok2);
    } catch (e) {
      console.log("verify (swapped b) threw:", e.shortMessage || e.message);
    }
  } catch (err) {
    console.error("❌ Error:", err.message || err);
    process.exit(1);
  }
})();
