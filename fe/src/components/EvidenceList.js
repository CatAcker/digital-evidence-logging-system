import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";
import "./evidence-list.css";

const CONTRACT_ADDRESS = addresses.EvidenceRegistry;
const abi = EvidenceRegistry.abi;

function getProvider() {
  const rpc = process.env.REACT_APP_RPC_URL || "http://127.0.0.1:8545";
  return new ethers.JsonRpcProvider(rpc);
}

export default function EvidenceList() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const fromBlock = useMemo(() => {
    const n = Number(addresses.DEPLOY_BLOCK ?? 0);
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

        // ---- initial history (chunked) ----
        const latest = await provider.getBlockNumber();
        const iface = new ethers.Interface(abi);
        const topic = iface.getEvent("EvidenceSubmitted").topicHash;

        async function getAllLogsChunked(addr, fromB, toB, step = 4000) {
          const all = [];
          for (let start = fromB; start <= toB; start += step + 1) {
            const end = Math.min(start + step, toB);
            const chunk = await provider.getLogs({
              address: addr,
              topics: [topic],
              fromBlock: start,
              toBlock: end,
            });
            all.push(...chunk);
          }
          return all;
        }

        const raw = await getAllLogsChunked(
          CONTRACT_ADDRESS,
          fromBlock,
          latest
        );
        const history = raw.map((log) => {
          const parsed = iface.parseLog(log);
          return formatParsedLog(parsed, log);
        });

        if (!cancelled) {
          setItems(sortByTimestamp(dedupeById(history)));
          setStatus("idle");
        }

        // ---- live updates (use same ID format) ----
        // ---- live updates (use same ID format) ----
        const onEvent = (...args) => {
          const ev = args[args.length - 1];
          const a = ev.args || [];

          const metaHash = a[2] ? String(a[2]) : "";
          let fileUrl = a[3] ? String(a[3]) : "";
          let note = undefined;

          // ✅ read local cache if available
          const cached = getCachedMeta(metaHash);
          if (cached) {
            if (typeof cached.note === "string" && cached.note.trim())
              note = cached.note;
            if (typeof cached.fileUrl === "string" && cached.fileUrl.trim())
              fileUrl = cached.fileUrl;
          }

          const row = {
            id: `${ev.transactionHash}-${ev.logIndex}`,
            submittedBy: String(a[0] ?? "0x"),
            hash: a[1] ? String(a[1]) : "",
            metadata: metaHash, // keep raw hash for reference
            note, // human-readable when available
            fileUrl, // prefer cached URL
            timestamp: toNumber(a[4] ?? 0),
            timeString: toNumber(a[4] ?? 0)
              ? new Date(Number(a[4]) * 1000).toLocaleString()
              : `block ${ev.blockNumber}`,
          };

          if (!cancelled) {
            setItems((prev) => sortByTimestamp(dedupeById([row, ...prev])));
          }
        };

        contract.on("EvidenceSubmitted", onEvent);

        return () => {
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
      <div className="evl evl-card">
        Failed to load evidence. <span className="muted">{error}</span>
      </div>
    );
  }

  return (
    <div className="evl evl-card">
      <h2 className="evl-title">Evidence</h2>

      {status === "loading" && (
        <ul className="evl-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="evl-item evl-skel" />
          ))}
        </ul>
      )}

      {status !== "loading" &&
        (items.length === 0 ? (
          <div className="evl-empty muted">No evidence yet.</div>
        ) : (
          <ul className="evl-list">
            {items.map((item) => (
              <li key={item.id} className="evl-item">
                <div className="evl-row">
                  <div className="evl-colL">
                    <div className="evl-hash">
                      <span className="evl-label">Hash:</span>{" "}
                      <span className="evl-hashValue">{item.hash}</span>
                    </div>

                    {/* Shows bytes32 metaHash */}
                    <div className="muted evl-note">
                      {item.note ?? item.metadata}
                    </div>

                    {item.fileUrl && (
                      <div className="evl-file">
                        <a href={item.fileUrl} target="_blank" rel="noreferrer">
                          Download file
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="evl-colR">
                    <div className="evl-by">
                      <span className="evl-label">By:</span>{" "}
                      {short(item.submittedBy)}
                    </div>
                    <div className="muted evl-time">{item.timeString}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

// ---- helpers ----
function getCachedMeta(metaHash) {
  try {
    if (!metaHash) return null;
    const key = `metaCache:${String(metaHash)}`; // must match the writer
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/** Parse V2 event: EvidenceSubmitted(address submitter, bytes32 fileHash, bytes32 metaHash, string fileUrl, uint256 timestamp) */
function formatParsedLog(parsed, log) {
  const a = parsed.args || [];
  const submittedBy = String(a[0] ?? "0x");
  const hash = a[1] ? String(a[1]) : "";
  const metaHash = a[2] ? String(a[2]) : "";
  let fileUrl = a[3] ? String(a[3]) : "";
  const ts = toNumber(a[4] ?? 0);

  // ✅ hydrate from localStorage if present
  let note;
  const cached = getCachedMeta(metaHash);
  if (cached) {
    if (typeof cached.note === "string" && cached.note.trim()) note = cached.note;
    if (typeof cached.fileUrl === "string" && cached.fileUrl.trim()) fileUrl = cached.fileUrl;
  }

  const logIndex = Number(log.logIndex || 0);
  const txHash = String(log.transactionHash || "");

  return {
    id: `${txHash}-${logIndex}`,
    submittedBy,
    hash,
    metadata: metaHash,                 // raw hash (reference)
    note,                               // human text when known
    fileUrl,
    timestamp: ts,
    timeString: ts ? new Date(ts * 1000).toLocaleString() : `block ${log.blockNumber}`,
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
