// fe/server/server.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const crypto = require("crypto");
const { keccak256, hexlify } = require("ethers");

// ---- config ----
const PORT = process.env.PORT || 3001;
const ROOT = path.join(__dirname, ".."); // fe/
const BUILD_DIR = path.join(ROOT, "build"); // fe/build
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// ensure upload dir exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

/** CORS (CRA dev) */
const corsOpts = {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
};
app.use(cors(corsOpts));
app.options("/upload", cors(corsOpts)); // preflight

// ---- READ-ONLY GATE for /files ----
app.all("/files/*", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  res.set("Allow", "GET, HEAD").status(405).send("Method Not Allowed");
});

// static files for saved uploads (force download + long cache)
app.use(
  "/files",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      const fn = path.basename(filePath);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
    },
  })
);

// multipart (hash before saving)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// helpers
function sha256Hex(buf) {
  return "0x" + crypto.createHash("sha256").update(buf).digest("hex");
}
function keccak256Hex(buf) {
  return keccak256(hexlify(buf)); // "0x..."
}

// API: POST /upload  (field name "file")
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file" });

    const buf = req.file.buffer;
    const k = keccak256Hex(buf);
    const s = sha256Hex(buf);
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const storedName = `${k.slice(2)}${ext}`;
    const absPath = path.join(UPLOAD_DIR, storedName);

    try {
      // Write once; fail if already exists (no overwrite)
      fs.writeFileSync(absPath, buf, { flag: "wx" });
      // Make file read-only for all (best-effort on Windows)
      try {
        fs.chmodSync(absPath, 0o444);
      } catch {}
    } catch (e) {
      if (e.code !== "EXIST") {
        console.error("Write failed:", e);
        return res.status(500).json({ ok: false, error: "Upload failed" });
      }
      // If file already exists, continue — return its info (same content)
    }

    const url = `/files/${storedName}`;
    res.json({ ok: true, keccak256: k, sha256: s, filename: storedName, url });
  } catch (e) {
    console.error("Upload failed:", e);
    res.status(500).json({ ok: false, error: "Upload failed" });
  }
});

// Optional: lookup by keccak
app.get("/by-keccak/:hex", (req, res) => {
  const hex = req.params.hex.startsWith("0x")
    ? req.params.hex.slice(2)
    : req.params.hex;
  const low = hex.toLowerCase();
  const file = fs.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(low));
  if (!file) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, filename: file, url: `/files/${file}` });
});

// Serve CRA build in prod
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(BUILD_DIR, "index.html"));
  });
} else {
  app.get("/", (_req, res) => res.send("uploader ok (build/ not found)"));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`▶ Server on http://localhost:${PORT}`);
  console.log(`   POST /upload    | field: file`);
  console.log(`   GET  /files/... | saved downloads (read-only)`);
});
