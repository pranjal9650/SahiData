import React, { useEffect, useState } from "react";
import axios from "axios";
import { ClipboardList, FileX } from "lucide-react";

const BASE_URL = "http://127.0.0.1:8000";

const T = {
  red:     "#CC0000",
  redDark: "#A30000",
  redBg:   "rgba(204,0,0,0.07)",
  black:   "#111111",
  grey200: "#E4E4E7",
  grey100: "#F4F4F5",
  white:   "#FFFFFF",
  muted:   "#71717A",
  green:   "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  blue:    "#2563EB",
  blueBg:  "rgba(37,99,235,0.07)",
  orange:  "#D97706",
  orangeBg:"rgba(217,119,6,0.08)",
  text:    "#111111",
};

/* ─── Number badge ───────────────────────────────────────────── */
function Badge({ value, color, bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 48, padding: "3px 12px", borderRadius: 99,
      fontSize: 12.5, fontWeight: 700, color, background: bg,
    }}>
      {value?.toLocaleString() ?? "—"}
    </span>
  );
}

/* ─── Accuracy bar ───────────────────────────────────────────── */
function AccuracyBar({ valid, total }) {
  const acc = total ? Math.round((valid / total) * 100) : 0;
  const color = acc >= 70 ? T.green : acc >= 40 ? T.orange : T.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 80, height: 5, borderRadius: 99, background: T.grey200, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, width: `${acc}%`, background: color, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 34 }}>{acc}%</span>
    </div>
  );
}

/* ─── History row ────────────────────────────────────────────── */
function HistoryRow({ row, index }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? T.grey100 : index % 2 === 0 ? T.white : "#FAFAFA", transition: "background 0.12s" }}
    >
      <td style={{ padding: "13px 18px", color: T.muted, fontWeight: 500, fontSize: 12.5 }}>{index + 1}</td>
      <td style={{ padding: "13px 18px", color: T.black, fontWeight: 600, maxWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(5,150,105,0.09)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.file_name}</span>
        </div>
      </td>

      {/* Form type — new column */}
      <td style={{ padding: "13px 18px" }}>
        {row.form_type ? (
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "3px 10px", borderRadius: 6,
            fontSize: 12, fontWeight: 600,
            background: T.blueBg, color: T.blue,
            border: "1px solid rgba(37,99,235,0.15)",
            whiteSpace: "nowrap",
          }}>
            {row.form_type}
          </span>
        ) : (
          <span style={{ color: T.muted, fontSize: 12 }}>—</span>
        )}
      </td>

      <td style={{ padding: "13px 18px", color: T.muted, whiteSpace: "nowrap" }}>{row.upload_time}</td>
      <td style={{ padding: "13px 18px" }}><Badge value={row.total_rows} color={T.blue}   bg={T.blueBg}  /></td>
      <td style={{ padding: "13px 18px" }}><Badge value={row.valid_rows} color={T.green}  bg={T.greenBg} /></td>
      <td style={{ padding: "13px 18px" }}><Badge value={row.junk_rows}  color={T.red}    bg={T.redBg}   /></td>
      <td style={{ padding: "13px 18px" }}><AccuracyBar valid={Number(row.valid_rows || 0)} total={Number(row.total_rows || 0)} /></td>
    </tr>
  );
}

/* ─── Summary card ───────────────────────────────────────────── */
function SummaryCard({ label, value, accent }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`,
        padding: "18px 20px", position: "relative", overflow: "hidden",
        transition: "all 0.18s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-2px)" : "none",
        cursor: "default", boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "14px 14px 0 0" }} />
      <p style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: -1, margin: "10px 0 0" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}


/* ─── Empty state ────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 12 }}>
      <div style={{ width: 60, height: 60, borderRadius: 14, background: T.grey100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FileX size={28} color="#A1A1AA" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: T.black, margin: 0 }}>No uploads yet</p>
      <p style={{ fontSize: 13.5, color: T.muted, margin: 0 }}>Uploaded files will appear here after validation.</p>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/UPLOAD-HISTORY`, { params: { _t: Date.now() } });
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    localStorage.removeItem("rulesUpdatedAt");
  }, []);

  useEffect(() => {
    const handler = () => {
      fetchHistory();
      localStorage.removeItem("rulesUpdatedAt");
    };
    window.addEventListener("rulesUpdated", handler);
    return () => window.removeEventListener("rulesUpdated", handler);
  }, []);

  /* ── Compute overall accuracy ── */
  const totalValid = history.reduce((s, r) => s + Number(r.valid_rows || 0), 0);
  const totalAll   = history.reduce((s, r) => s + Number(r.total_rows || 0), 0);
  const overallAcc = totalAll ? `${Math.round((totalValid / totalAll) * 100)}%` : "—";

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: T.muted, fontSize: 14, fontWeight: 500 }}>Loading history…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Stats strip ── */}
      {history.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <SummaryCard label="Total Uploads"   value={history.length}                                                          accent={T.blue}   />
          <SummaryCard label="Total Valid Rows" value={totalValid}                                                              accent={T.green}  />
          <SummaryCard label="Total Junk Rows"  value={history.reduce((s, r) => s + Number(r.junk_rows || 0), 0)}              accent={T.red}    />
          <SummaryCard label="Overall Accuracy" value={overallAcc}                                                              accent={T.orange} />
        </div>
      )}

      {/* ── Table card ── */}
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

        {/* Card header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${T.grey200}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ClipboardList size={18} color={T.red} />
            <span style={{ fontSize: 15, fontWeight: 700, color: T.black }}>File History</span>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, background: T.grey100, padding: "4px 12px", borderRadius: 99, border: `1px solid ${T.grey200}` }}>
            {history.length} file{history.length !== 1 ? "s" : ""}
          </span>
        </div>

        {history.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: T.grey100 }}>
                  {["#", "File Name", "Form Type", "Upload Time", "Total Rows", "Valid Rows", "Junk Rows", "Accuracy"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 18px", textAlign: "left",
                      fontSize: 11.5, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: 0.6,
                      color: T.muted, borderBottom: `1px solid ${T.grey200}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => <HistoryRow key={i} row={row} index={i} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default History;
