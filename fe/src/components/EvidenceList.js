import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";   // V1 ABI
import addresses from "../abis/addresses.json";

const CONTRACT_ADDRESS = addresses.EvidenceRegistry;            // V1 address
const abi = EvidenceRegistry.abi;

function getProvider() {
  const rpc = process.env.REACT_APP_RPC_URL;
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  throw new Error("No provider: install MetaMask or set REACT_APP_RPC_URL");
}

export default function EvidenceList() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const fromBlock = useMemo(() => {
    const raw = process.env.REACT_APP_DEPLOY_BLOCK;
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let contract;

    (async () => {
      try {
        setStatus("loading");
        const provider = getProvider();
        contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        // 1) history
        const latest = await provider.getBlockNumber();
        const logs = await contract.queryFilter("EvidenceSubmitted", fromBlock, latest);
        const history = logs.map(formatEvent);
        if (!cancelled) {
          setItems(sortByTimestamp(dedupeById(history)));
          setStatus("idle");
        }

        // 2) live updates
        const onEvent = (...args) => {
          const ev = args[args.length - 1];
          const row = formatEvent(ev);
          if (!cancelled) setItems((prev) => sortByTimestamp(dedupeById([row, ...prev])));
        };
        contract.on("EvidenceSubmitted", onEvent);

        return () => {
          try { contract?.removeAllListeners?.("EvidenceSubmitted"); } catch {}
        };
      } catch (e) {
        console.error(e);
        if (!cancelled) { setError(e?.message || "Failed to load events"); setStatus("error"); }
      }
    })();

    return () => { cancelled = true; };
  }, [fromBlock]);

  if (status === "error") {
    return <div className="card">Failed to load evidence. <span className="muted">{error}</span></div>;
  }

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 0 }}>Evidence</h2>
      {items.length === 0 ? (
        <div className="muted">No evidence yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li key={item.id} className="card" style={{ marginBottom: 12 }}>
              <div className="row" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div><strong>Hash:</strong> {item.hash}</div>

                  {/* Show note or raw metadata */}
                  <div className="muted" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                    {item.note ?? item.metadata}
                  </div>

                  {/* Download link if metadata contained fileUrl */}
                  {item.fileUrl && (
                    <div style={{ marginTop: 6, overflowWrap: "anywhere" }}>
                      <a href={item.fileUrl} target="_blank" rel="noreferrer">Download file</a>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div><strong>By:</strong> {short(item.submittedBy)}</div>
                  <div className="muted">{item.timeString}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Parse V1 event: EvidenceSubmitted(address submitter, string hash, string metadata, uint256 timestamp) */
function formatEvent(ev) {
  const a = ev.args || [];
  const submittedBy = a.submitter ?? a.sender ?? a.owner ?? a.from ?? a[0] ?? "0x";
  const hash = a.hash ?? a[1] ?? "";
  const metadata = a.metadata ?? a[2] ?? "";
  const ts = toNumber(a.timestamp ?? a.time ?? a[3] ?? 0);

  // Try to parse metadata as JSON: { note, fileUrl }
  let note;
  let fileUrl = "";
  try {
    const o = JSON.parse(metadata);
    if (o && typeof o === "object") {
      if (typeof o.note === "string") note = o.note;
      if (typeof o.fileUrl === "string") fileUrl = o.fileUrl;
    }
  } catch { /* metadata was plain text; ignore */ }

  const blockNumber = ev.blockNumber ?? ev.log?.blockNumber ?? 0;
  const logIndex = ev.index ?? ev.log?.index ?? ev.logIndex ?? 0;

  return {
    id: `${blockNumber}-${logIndex}`,
    submittedBy,
    hash,
    metadata,
    note,
    fileUrl,
    timestamp: ts,
    timeString: ts ? new Date(ts * 1000).toLocaleString() : `block ${blockNumber}`,
  };
}

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v.toString === "function") return Number(v.toString());
  return 0;
}
function short(addr = "") {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
function dedupeById(rows) {
  const seen = new Set(); const out = [];
  for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
}
function sortByTimestamp(rows, newestFirst = true) {
  return [...rows].sort((a, b) => newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
}
