import React, { useState, useEffect } from "react";
import { Search, X, Database } from "lucide-react";

const T = {
  red:         "#CC0000",
  redDark:     "#A30000",
  redBg:       "rgba(204,0,0,0.06)",
  redBorder:   "rgba(204,0,0,0.18)",
  black:       "#111111",
  border:      "#EBEBEB",
  borderHover: "#D4D4D4",
  bg:          "#F7F7F5",
  white:       "#FFFFFF",
  green:       "#059669",
  greenBg:     "rgba(5,150,105,0.07)",
  greenBorder: "rgba(5,150,105,0.18)",
  text:        "#0A0A0A",
  textSub:     "#404040",
  muted:       "#888",
};

function StatusBadge({ status }) {
  const isValid = String(status).toLowerCase() === "valid";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 5,
      fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1px",
      background: isValid ? T.greenBg : T.redBg,
      color: isValid ? T.green : T.red,
      border: `1px solid ${isValid ? T.greenBorder : T.redBorder}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        background: isValid ? T.green : T.red,
      }} />
      {isValid ? "Valid" : "Invalid"}
    </span>
  );
}

export default function FormData() {
  const [allFormTypes, setAllFormTypes]     = useState([]);
  const [selectedForms, setSelectedForms]   = useState([]);
  const [data, setData]                     = useState([]);
  const [loading, setLoading]               = useState(false);
  const [formsLoading, setFormsLoading]     = useState(true);
  const [message, setMessage]               = useState("");
  const [searchUsername, setSearchUsername] = useState("");
  const [searchFocused, setSearchFocused]   = useState(false);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/GET-FORM-NAMES")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAllFormTypes(d.filter((f) => f !== "Others")); })
      .catch(() => setAllFormTypes([]))
      .finally(() => setFormsLoading(false));
  }, []);

  /* re-fetch visible data whenever rules change */
  useEffect(() => {
    const handler = () => { if (data.length > 0) fetchData(); };
    window.addEventListener("rulesUpdated", handler);
    return () => window.removeEventListener("rulesUpdated", handler);
  }, [data.length, selectedForms]); // eslint-disable-line

  const toggleForm = (value) => {
    if (value === "ALL") {
      setSelectedForms(selectedForms.length === allFormTypes.length ? [] : [...allFormTypes]);
      return;
    }
    setSelectedForms((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]
    );
  };

  const fetchData = async () => {
    if (!selectedForms.length) { setMessage("Select at least one form type."); return; }
    setLoading(true); setMessage(""); setData([]);
    try {
      const q = selectedForms.length === allFormTypes.length ? "ALL" : selectedForms.join(",");
      const res = await fetch(`http://127.0.0.1:8000/FORM-DATA-MULTI?forms=${encodeURIComponent(q)}`);
      const result = await res.json();
      if (!Array.isArray(result) || result.length === 0) setMessage("No records found.");
      else setData(result);
    } catch { setMessage("Unable to reach the server. Please try again."); }
    setLoading(false);
  };

  const filteredData = data.filter((row) =>
    !searchUsername || String(row.username || "").toLowerCase().includes(searchUsername.toLowerCase())
  );
  const visibleRows  = filteredData.slice(0, 200);
  const validCount   = filteredData.filter((r) => String(r.status).toLowerCase() === "valid").length;
  const invalidCount = filteredData.length - validCount;
  const allSelected  = selectedForms.length === allFormTypes.length && allFormTypes.length > 0;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Form Selector ─────────────────────────────────────── */}
      <div style={{
        background: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* Header row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Select Forms</span>
            {selectedForms.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: T.red,
                background: T.redBg, border: `1px solid ${T.redBorder}`,
                padding: "1px 7px", borderRadius: 99,
              }}>
                {selectedForms.length} selected
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {selectedForms.length > 0 && (
              <button
                onClick={() => setSelectedForms([])}
                style={{
                  fontSize: 12, color: T.muted, background: "none",
                  border: "none", cursor: "pointer", padding: "4px 8px",
                  fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <X size={11} /> Clear
              </button>
            )}
            {!formsLoading && allFormTypes.length > 0 && (
              <button
                onClick={() => toggleForm("ALL")}
                style={{
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  padding: "5px 12px", borderRadius: 7,
                  border: `1px solid ${allSelected ? T.redBorder : T.border}`,
                  background: allSelected ? T.redBg : T.bg,
                  color: allSelected ? T.red : T.textSub,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.14s ease",
                }}
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
        </div>

        {/* Pills grid */}
        <div style={{ padding: "16px 20px" }}>
          {formsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 13 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${T.border}`, borderTop: `2px solid ${T.red}`, animation: "spin 0.8s linear infinite" }} />
              Loading form types…
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allFormTypes.map((f) => {
                const on = selectedForms.includes(f);
                return (
                  <button key={f} onClick={() => toggleForm(f)} style={{
                    padding: "7px 15px",
                    borderRadius: 8,
                    border: `1px solid ${on ? T.redBorder : T.border}`,
                    background: on ? T.redBg : T.bg,
                    color: on ? T.red : T.textSub,
                    fontSize: 13, fontWeight: on ? 700 : 500,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer", transition: "all 0.14s ease",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                  onMouseEnter={(e) => { if (!on) { e.currentTarget.style.borderColor = T.redBorder; e.currentTarget.style.color = T.red; } }}
                  onMouseLeave={(e) => { if (!on) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSub; } }}
                  >
                    {on && <span style={{ fontSize: 9 }}>✓</span>}
                    {f}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action row */}
        <div style={{
          padding: "16px 20px",
          borderTop: `1px solid ${T.border}`,
          background: T.white,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <button
            onClick={fetchData}
            disabled={loading || formsLoading || selectedForms.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "0 20px", height: 38, borderRadius: 8,
              background: loading || selectedForms.length === 0
                ? "#F4F4F5"
                : `linear-gradient(135deg, ${T.red} 0%, ${T.redDark} 100%)`,
              border: loading || selectedForms.length === 0
                ? "1px solid #E4E4E7"
                : "1px solid rgba(0,0,0,0.12)",
              boxShadow: loading || selectedForms.length === 0
                ? "none"
                : "0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
              color: loading || selectedForms.length === 0 ? "#A1A1AA" : T.white,
              fontSize: 13, fontWeight: 600, letterSpacing: "-0.1px",
              fontFamily: "'DM Sans', sans-serif",
              cursor: loading || selectedForms.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!loading && selectedForms.length > 0) {
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(204,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = loading || selectedForms.length === 0
                ? "none"
                : "0 1px 2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)";
              e.currentTarget.style.transform = "none";
            }}
          >
            {loading ? (
              <>
                <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)", borderTop: "2px solid rgba(255,255,255,0.85)", animation: "spin 0.75s linear infinite", flexShrink: 0 }} />
                <span>Fetching…</span>
              </>
            ) : (
              <>
                <Database size={13} style={{ flexShrink: 0, opacity: selectedForms.length === 0 ? 0.4 : 1 }} />
                <span>Fetch Records</span>
              </>
            )}
          </button>

          {!loading && selectedForms.length > 0 && (
            <span style={{ fontSize: 12, color: T.muted, letterSpacing: "0.1px" }}>
              {selectedForms.length === allFormTypes.length
                ? "All form types selected"
                : `${selectedForms.length} of ${allFormTypes.length} form types`}
            </span>
          )}
        </div>
      </div>

      {/* Error message */}
      {message && (
        <div style={{
          padding: "11px 16px", borderRadius: 9,
          background: T.redBg, border: `1px solid ${T.redBorder}`,
          borderLeft: `3px solid ${T.red}`,
          color: T.red, fontSize: 13.5, fontWeight: 500,
        }}>
          {message}
        </div>
      )}

      {/* ── Results Table ──────────────────────────────────────── */}
      {data.length > 0 && !loading && (
        <div style={{
          background: T.white,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          animation: "fadeIn 0.25s ease",
        }}>
          {/* Table topbar */}
          <div style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            {/* Left: counts */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                {filteredData.length > 200
                  ? `Showing 200 of ${filteredData.length.toLocaleString()} records`
                  : `${filteredData.length.toLocaleString()} record${filteredData.length !== 1 ? "s" : ""}`}
              </span>
              <div style={{ width: 1, height: 14, background: T.border }} />
              <span style={{
                fontSize: 12, fontWeight: 600, color: T.green,
                background: T.greenBg, border: `1px solid ${T.greenBorder}`,
                padding: "2px 9px", borderRadius: 5,
              }}>
                ✓ {validCount.toLocaleString()} valid
              </span>
              <span style={{
                fontSize: 12, fontWeight: 600, color: T.red,
                background: T.redBg, border: `1px solid ${T.redBorder}`,
                padding: "2px 9px", borderRadius: 5,
              }}>
                ✕ {invalidCount.toLocaleString()} invalid
              </span>
              {filteredData.length > 200 && (
                <span style={{
                  fontSize: 12, color: T.muted,
                  background: T.bg, border: `1px solid ${T.border}`,
                  padding: "2px 9px", borderRadius: 5,
                }}>
                  Use search to narrow results
                </span>
              )}
            </div>

            {/* Right: search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: searchFocused ? T.white : T.bg,
              border: `1px solid ${searchFocused ? T.red : T.border}`,
              borderRadius: 8, padding: "7px 11px", minWidth: 220,
              transition: "all 0.15s ease",
              boxShadow: searchFocused ? "0 0 0 3px rgba(204,0,0,0.08)" : "none",
            }}>
              <Search size={13} color={T.muted} style={{ flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search username…"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={{
                  flex: 1, border: "none", background: "transparent",
                  outline: "none", fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif", color: T.text,
                  minWidth: 0,
                }}
              />
              {searchUsername && (
                <X size={12} color={T.muted} style={{ cursor: "pointer", flexShrink: 0 }}
                  onClick={() => setSearchUsername("")} />
              )}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Form Type</th>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => {
                  const isLast = i === visibleRows.length - 1;
                  const isValid = String(row.status).toLowerCase() === "valid";
                  return (
                    <tr
                      key={i}
                      style={{ background: T.white, transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.bg}
                      onMouseLeave={(e) => e.currentTarget.style.background = T.white}
                    >
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : `1px solid ${T.border}`, color: T.muted, fontSize: 12, width: 48 }}>
                        {i + 1}
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : `1px solid ${T.border}` }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: T.textSub,
                          background: T.bg, border: `1px solid ${T.border}`,
                          padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap",
                        }}>
                          {row.form_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isValid ? T.greenBg : T.redBg,
                            border: `1px solid ${isValid ? T.greenBorder : T.redBorder}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 800,
                            color: isValid ? T.green : T.red,
                          }}>
                            {(row.username || "?")[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: T.text }}>
                            {row.username || "N/A"}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : `1px solid ${T.border}` }}>
                        <StatusBadge status={row.status} />
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : `1px solid ${T.border}`, color: T.muted, fontSize: 13 }}>
                        {row.date}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "10px 20px",
  textAlign: "left",
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  color: "#A0A0A0",
  borderBottom: "1px solid #EBEBEB",
  background: "#FAFAF9",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 20px",
};
