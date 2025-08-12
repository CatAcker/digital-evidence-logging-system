// fe/src/App.jsx
import EvidenceForm from "./components/EvidenceForm";
import EvidenceList from "./components/EvidenceList";
import EvidenceVerify from "./components/EvidenceVerify";

export default function App() {
  return (
    <div style={{ maxWidth: 820, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Digital Evidence (ZK‑Verified)</h1>
      <EvidenceForm />
      <hr style={{ margin: "2rem 0" }} />
      <EvidenceList />
      <hr style={{ margin: "2rem 0" }} />
      <EvidenceVerify />
    </div>
  );
}
