import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // update on redeploy
const EVENT_NAME = "EvidenceSubmitted"; // adjust if different

function getProvider() {
  const rpc = process.env.REACT_APP_RPC_URL;
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  throw new Error("No provider: install MetaMask or set REACT_APP_RPC_URL");
}

async function keccak256File(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf)); // 0x-prefixed hex
}

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v.toString === "function") return Number(v.toString());
  return 0;
}

function formatEvent(ev) {
  const a = ev.args || [];
  const submittedBy = a.submitter ?? a.sender ?? a.owner ?? a.from ?? a[0] ?? "0x";
  const hash = a.hash ?? a.fileHash ?? a.commitment ?? a[1] ?? "";
  const metadata = a.metadata ?? a.note ?? a.description ?? a[2] ?? "";
  const ts = toNumber(a.timestamp ?? a.time ?? a[3] ?? 0);

  const blockNumber = ev.blockNumber ?? ev.log?.blockNumber ?? 0;
  const logIndex = ev.index ?? ev.log?.index ?? ev.logIndex ?? 0;

  return {
    id: `${blockNumber}-${logIndex}`,
    submittedBy,
    hash: typeof hash === "string" ? hash : String(hash),
    metadata: typeof metadata === "string" ? metadata : String(metadata),
    timestamp: ts,
    timeString: ts ? new Date(ts * 1000).toLocaleString() : `block ${blockNumber}`,
  };
}

// strict keccak-256 hex validator (0x + 64 hex chars)
function isKeccak256Hex(s) {
  return /^0x[0-9a-fA-F]{64}$/.test(s || "");
}

export default function EvidenceVerify() {
  const [mode, setMode] = useState("file"); // 'file' | 'hash'
  const [file, setFile] = useState(null);
  const [typedHash, setTypedHash] = useState("");
  const [computedHash, setComputedHash] = useState(""); // from file
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const fromBlock = useMemo(() => {
    const raw = process.env.REACT_APP_DEPLOY_BLOCK;
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }, []);

  const runVerify = async (queryHash) => {
    setMatches([]);
    setStatus("loading");
    setError("");
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
      const latest = await provider.getBlockNumber();

      const logs = await contract.queryFilter(EVENT_NAME, fromBlock, latest);
      const rows = logs.map(formatEvent);

      const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : String(s));
      const target = norm(queryHash);

      const found = rows.filter((r) => norm(r.hash) === target);
      setMatches(found);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Verification failed");
      setStatus("error");
    }
  };

  const onVerifyFile = async (e) => {
    e.preventDefault();
    if (!file) return;
    try {
      setComputedHash("");
      const h = await keccak256File(file);
      setComputedHash(h);
      await runVerify(h);
    } catch (e) {
      console.error(e);
      setError("Could not hash file");
      setStatus("error");
    }
  };

  const onVerifyHash = async (e) => {
    e.preventDefault();
    const h = typedHash.trim();
    if (!h) return;

    // If it looks like hex, enforce strict keccak; else assume decimal commitment (demo mode)
    if (h.startsWith("0x")) {
      if (!isKeccak256Hex(h)) {
        setError("Invalid hash: must be 0x + 64 hex chars (Keccak-256).");
        setStatus("error");
        return;
      }
      await runVerify(h.toLowerCase());
    } else {
      if (!/^\d+$/.test(h)) {
        setError("Invalid commitment: paste a decimal number (no spaces).");
        setStatus("error");
        return;
      }
      await runVerify(h);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Verify Evidence</h2>

      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <label>
          <input
            type="radio"
            name="verifyMode"
            value="file"
            checked={mode === "file"}
            onChange={() => setMode("file")}
          />{" "}
          By File (re-compute Keccak-256)
        </label>
        <label>
          <input
            type="radio"
            name="verifyMode"
            value="hash"
            checked={mode === "hash"}
            onChange={() => setMode("hash")}
          />{" "}
          By Hash (paste on-chain value)
        </label>
      </div>

      {mode === "file" ? (
        <form onSubmit={onVerifyFile} className="row" style={{ flexDirection: "column", gap: 12 }}>
          <label className="muted">Select the original file you expect was recorded on-chain.</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="button" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Verifying..." : "Verify File"}
          </button>
          {computedHash && (
            <div className="muted" style={{ wordBreak: "break-all" }}>
              Computed Keccak-256: {computedHash}
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={onVerifyHash} className="row" style={{ flexDirection: "column", gap: 12 }}>
          <label className="muted">Paste the on-chain hash (0x… for file mode) or decimal commitment (demo mode).</label>
          <input
            className="input"
            placeholder="0xabc… or 12345"
            value={typedHash}
            onChange={(e) => setTypedHash(e.target.value)}
          />
          <button className="button" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Verifying..." : "Verify Hash"}
          </button>
        </form>
      )}

      {status === "error" && (
        <div className="card" style={{ marginTop: 12 }}>
          Failed: <span className="muted">{error}</span>
        </div>
      )}

      {status === "done" && (
        <div className="card" style={{ marginTop: 12 }}>
          {matches.length === 0 ? (
            <div>No on-chain record found for this value.</div>
          ) : (
            <>
              <div><strong>Match found ✅</strong></div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {matches.map((m) => (
                  <li key={m.id} className="card">
                    <div style={{ wordBreak: "break-all" }}>
                      <strong>Hash:</strong> {m.hash}
                    </div>
                    <div className="muted">{m.metadata}</div>
                    <div className="muted">By {short(m.submittedBy)} at {m.timeString}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <p className="muted" style={{ marginTop: 12 }}>
        Tip: “Verify by File” works for records stored as file Keccak-256. For “Numeric commitment (demo)” records, use “Verify by Hash” and paste the decimal commitment.
      </p>
    </div>
  );
}

function short(addr = "") {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
