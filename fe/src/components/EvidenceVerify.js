import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";
import "./evidence-verify.css";

const abi = EvidenceRegistry.abi;
const CONTRACT_ADDRESS = addresses.EvidenceRegistry;
const EVENT_NAME = "EvidenceSubmitted";

function getProvider() {
  const rpc = process.env.REACT_APP_RPC_URL;
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  throw new Error("No provider: install MetaMask or set REACT_APP_RPC_URL");
}

async function keccak256File(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf));
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
  const submittedBy =
    a.submitter ?? a.sender ?? a.owner ?? a.from ?? a[0] ?? "0x";
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
    timeString: ts
      ? new Date(ts * 1000).toLocaleString()
      : `block ${blockNumber}`,
  };
}

function isKeccak256Hex(s) {
  return /^0x[0-9a-fA-F]{64}$/.test(s || "");
}

export default function EvidenceVerify() {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [typedHash, setTypedHash] = useState("");
  const [computedHash, setComputedHash] = useState("");
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

      const norm = (s) =>
        typeof s === "string" ? s.trim().toLowerCase() : String(s);
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
    <div className="verify mt-6 rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm dark:border-gray-800/60 dark:bg-gray-950">
      <h2 className="text-2xl font-semibold tracking-tight">Verify Evidence</h2>

      {/* Mode toggle */}
      <div className="verifyType">
        <label className="">
          <input
            type="radio"
            name="verifyMode"
            value="file"
            checked={mode === "file"}
            onChange={() => setMode("file")}
            className="h-4 w-4 accent-green-600"
          />
          <span>By File (re-compute Keccak-256)</span>
        </label>

        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition
          ${
            mode === "hash"
              ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20"
              : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
          }`}
        >
          <input
            type="radio"
            name="verifyMode"
            value="hash"
            checked={mode === "hash"}
            onChange={() => setMode("hash")}
            className="h-4 w-4 accent-indigo-600"
          />
          <span>By Hash (paste on-chain value)</span>
        </label>
      </div>

      {/* Forms */}
      {mode === "file" ? (
        <form onSubmit={onVerifyFile} className="selectFile">
          <label className="text-sm text-gray-500 dark:text-gray-400">
            Select the original file you expect was recorded on-chain.
          </label>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />

          <button
            type="submit"
            disabled={status === "loading"}
            className="verify-btn"
          >
            {status === "loading" ? "Verifying..." : "Verify File"}
          </button>

          {computedHash && (
            <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Computed Keccak-256:
              </span>{" "}
              <span className="break-all font-mono">{computedHash}</span>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={onVerifyHash} className="mt-5 flex flex-col gap-3">
          <label className="text-sm text-gray-500 dark:text-gray-400">
            Paste the on-chain hash (0x… for file mode) or decimal commitment
            (demo mode).
          </label>

          <input
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-gray-800"
            placeholder="0xabc… or 12345"
            value={typedHash}
            onChange={(e) => setTypedHash(e.target.value)}
          />

          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            type="submit"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Verifying..." : "Verify Hash"}
          </button>
        </form>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="font-semibold">Failed</div>
          <div className="mt-1 text-red-600/90 dark:text-red-300/90">
            {error}
          </div>
        </div>
      )}

      {/* Results */}
      {status === "done" && (
        <div className="mt-6">
          {matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No on-chain record found for this value.
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-green-700 dark:text-green-400">
                ✅ Match found
              </h3>
              <ul className="space-y-4">
                {matches.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="break-words font-mono text-sm">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        Hash:
                      </span>{" "}
                      {m.hash}
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {m.metadata}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Submitted by{" "}
                      <span className="font-medium">
                        {short(m.submittedBy)}
                      </span>{" "}
                      at {m.timeString}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        Tip: “Verify by File” works for records stored as file Keccak-256. For
        “Numeric commitment (demo)” records, use “Verify by Hash” and paste the
        decimal commitment.
      </p>
    </div>
  );
}

function short(addr = "") {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
