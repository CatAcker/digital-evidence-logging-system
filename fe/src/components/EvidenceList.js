import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";

// Same address you used in EvidenceForm (change if you redeploy)
const CONTRACT_ADDRESS = addresses.EvidenceRegistry;
const abi = EvidenceRegistry.abi;

// Optional: set REACT_APP_RPC_URL for read-only (e.g., Hardhat/Infura)
// Optional: set REACT_APP_DEPLOY_BLOCK to avoid scanning from block 0
function getProvider() {
  const rpc = process.env.REACT_APP_RPC_URL;
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  throw new Error("No provider: install MetaMask or set REACT_APP_RPC_URL");
}

export default function EvidenceList() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | error
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

        // 1) Historical events
        const latest = await provider.getBlockNumber();
        const logs = await contract.queryFilter("EvidenceSubmitted", fromBlock, latest);

        const history = logs.map((ev) => formatEvent(ev));
        if (!cancelled) {
          setItems(sortByTimestamp(dedupeById(history)));
          setStatus("idle");
        }

        // 2) Live updates
        const onEvent = (...args) => {
          const ev = args[args.length - 1]; // last arg is the Event object
          const row = formatEvent(ev);
          if (!cancelled) {
            setItems((prev) => sortByTimestamp(dedupeById([row, ...prev])));
          }
        };
        contract.on("EvidenceSubmitted", onEvent);

        // Cleanup
        return () => {
          cancelled = true;
          try {
            contract?.removeAllListeners?.("EvidenceSubmitted");
          } catch {}
        };
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(e?.message || "Failed to load events");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromBlock]);

  if (status === "error") {
    return (
      <div className="card">
        Failed to load evidence. <span className="muted">{error}</span>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Evidence</h2>
      {items.length === 0 ? (
        <div className="muted">No evidence yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li key={item.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div>
                    <strong>Hash:</strong> {item.hash}
                  </div>
                  <div className="muted">{item.metadata}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>
                    <strong>By:</strong> {short(item.submittedBy)}
                  </div>
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
    hash: hash,
    metadata: metadata,
    submittedBy: submittedBy,
    timestamp: ts,
    timeString: ts
      ? new Date(ts * 1000).toLocaleString()
      : `block ${blockNumber}`,
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
  return addr.length > 10
    ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
    : addr;
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

function sortByTimestamp(rows, newestFirst = true) {
  return [...rows].sort((a, b) =>
    newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  );
}
