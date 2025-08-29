// fe/server/server.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");                     // ✅ CORS
const crypto = require("crypto");
const { keccak256, hexlify } = require("ethers");

// ---- config ----
const PORT = process.env.PORT || 3001;
const ROOT = path.join(__dirname, "..");         // fe/
const BUILD_DIR = path.join(ROOT, "build");      // fe/build
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// ensure upload dir exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

/** ✅ Allow CRA dev origins (localhost & 127.0.0.1) */
const corsOpts = {
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
};
app.use(cors(corsOpts));
app.options("/upload", cors(corsOpts));          // ✅ handle preflight for POST /upload

// static files for saved uploads
app.use("/files", express.static(UPLOAD_DIR));

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
    const ext = path.extname(req.file.originalname).toLowerCase();
    const storedName = `${k.slice(2)}${ext}`;
    const absPath = path.join(UPLOAD_DIR, storedName);

    if (!fs.existsSync(absPath)) {
      fs.writeFileSync(absPath, buf);
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
  const hex = req.params.hex.startsWith("0x") ? req.params.hex.slice(2) : req.params.hex;
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
  console.log(`   POST /upload   | field: file`);
  console.log(`   GET  /files/...| saved downloads`);
  if (fs.existsSync(BUILD_DIR)) {
    console.log(`   Serving CRA from ${BUILD_DIR}`);
  } else {
    console.log(`   CRA build not found; run "npm run build" in fe/`);
  }
});
