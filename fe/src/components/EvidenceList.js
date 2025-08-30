import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import EvidenceRegistry from "../abis/EvidenceRegistry.json";
import addresses from "../abis/addresses.json";
import "./evidence-list.css"; // ← new stylesheet

const CONTRACT_ADDRESS = addresses.EvidenceRegistry;
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

        // initial history
        const latest = await provider.getBlockNumber();
        const logs = await contract.queryFilter(
          "EvidenceSubmitted",
          fromBlock,
          latest
        );
        const history = logs.map(formatEvent);
        if (!cancelled) {
          setItems(sortByTimestamp(dedupeById(history)));
          setStatus("idle");
        }

        // live updates
        const onEvent = (...args) => {
          const ev = args[args.length - 1];
          const row = formatEvent(ev);
          if (!cancelled)
            setItems((prev) => sortByTimestamp(dedupeById([row, ...prev])));
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

/** Parse V1 event: EvidenceSubmitted(address submitter, string hash, string metadata, uint256 timestamp) */
function formatEvent(ev) {
  const a = ev.args || [];
  const submittedBy =
    a.submitter ?? a.sender ?? a.owner ?? a.from ?? a[0] ?? "0x";
  const hash = a.hash ?? a[1] ?? "";
  const metadata = a.metadata ?? a[2] ?? "";
  const ts = toNumber(a.timestamp ?? a.time ?? a[3] ?? 0);

  let note;
  let fileUrl = "";
  try {
    const o = JSON.parse(metadata);
    if (o && typeof o === "object") {
      if (typeof o.note === "string") note = o.note;
      if (typeof o.fileUrl === "string") fileUrl = o.fileUrl;
    }
  } catch {
    /* metadata was plain text; ignore */
  }

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
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows)
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  return out;
}
function sortByTimestamp(rows, newestFirst = true) {
  return [...rows].sort((a, b) =>
    newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  );
}
