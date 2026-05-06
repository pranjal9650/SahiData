import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import SiteAnalytics from "./SiteAnalytics";

const BASE_URL = "http://127.0.0.1:8000";

const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  black:    "#111111",
  grey200:  "#E4E4E7",
  grey100:  "#F4F4F5",
  white:    "#FFFFFF",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.08)",
  redBg:    "rgba(204,0,0,0.07)",
  blueBg:   "rgba(37,99,235,0.07)",
  blue:     "#2563EB",
  text:     "#111111",
  muted:    "#71717A",
  orange:   "#D97706",
  orangeBg: "rgba(217,119,6,0.08)",
  purple:   "#7C3AED",
  purpleBg: "rgba(124,58,237,0.07)",
};

const thStyle = {
  padding: "10px 20px",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: T.muted,
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${T.grey200}`,
  background: T.grey100,
};

const tdStyle = {
  padding: "12px 20px",
  borderBottom: `1px solid ${T.grey200}`,
  color: T.text,
  fontSize: 13.5,
  whiteSpace: "nowrap",
};

function MiniAccuracy({ valid, total }) {
  if (!total) return <span style={{ color: T.muted, fontSize: 12 }}>—</span>;
  const acc   = Math.round((valid / total) * 100);
  const color = acc >= 70 ? T.green : acc >= 40 ? T.orange : T.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 52, height: 4, borderRadius: 99, background: T.grey200, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, width: `${acc}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{acc}%</span>
    </div>
  );
}

function Analytics() {
  const [analyticsView, setAnalyticsView]             = useState("forms");
  const [gridData, setGridData]                       = useState([]);
  const [allFormNames, setAllFormNames]               = useState([]);
  const [formRules, setFormRules]                     = useState({});
  const [circleSummary, setCircleSummary]             = useState(null);
  const [monthYear, setMonthYear]                     = useState("");
  const [searchUsername, setSearchUsername]           = useState("");
  const [loading, setLoading]                         = useState(false);
  const [showCircleAnalytics, setShowCircleAnalytics] = useState(false);
  const [searchFocused, setSearchFocused]             = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const bust = `_t=${Date.now()}`;
      let url = `${BASE_URL}/ANALYTICS?${bust}`;
      if (monthYear) url += `&month=${monthYear}`;

      const [analyticsRes, rulesRes] = await Promise.allSettled([
        axios.get(url),
        axios.get(`${BASE_URL}/GET-ALL-FORM-RULES`),
      ]);

      if (analyticsRes.status === "fulfilled") processAnalytics(analyticsRes.value.data);
      if (rulesRes.status    === "fulfilled") setFormRules(rulesRes.value.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    fetchAnalytics();
    localStorage.removeItem("rulesUpdatedAt");
  }, [fetchAnalytics]);

  useEffect(() => {
    const handler = () => {
      fetchAnalytics();
      localStorage.removeItem("rulesUpdatedAt");
    };
    window.addEventListener("rulesUpdated", handler);
    return () => window.removeEventListener("rulesUpdated", handler);
  }, [fetchAnalytics]);

  const processAnalytics = (data) => {
    if (!Array.isArray(data)) return;

    const finalGrid    = [];
    const formNamesSet = new Set();
    const circleMap    = {};

    data.forEach((user) => {
      const row          = { username: user.username, forms: {}, total: 0 };
      const backendForms = user.forms || {};

      Object.keys(backendForms).forEach((formName) => {
        formNamesSet.add(formName);
        const d       = backendForms[formName];
        const valid   = Number(d?.valid   || 0);
        const invalid = Number(d?.invalid || 0);
        const total   = valid + invalid;

        row.forms[formName] = { valid, invalid, total };
        row.total += total;

        const circleData = d?.circleWise || {};
        Object.keys(circleData).forEach((circle) => {
          if (!circleMap[formName])         circleMap[formName] = {};
          if (!circleMap[formName][circle]) circleMap[formName][circle] = 0;
          circleMap[formName][circle] += Number(circleData[circle] || 0);
        });
      });

      finalGrid.push(row);
    });

    setAllFormNames([...formNamesSet]);
    setGridData(finalGrid);
    setCircleSummary(circleMap);
  };

  const colTotals = allFormNames.reduce((acc, name) => {
    const valid   = gridData.reduce((s, r) => s + (r.forms[name]?.valid   || 0), 0);
    const invalid = gridData.reduce((s, r) => s + (r.forms[name]?.invalid || 0), 0);
    acc[name] = { valid, invalid, total: valid + invalid };
    return acc;
  }, {});

  const filteredGrid = gridData.filter((row) =>
    row.username?.toLowerCase().includes(searchUsername.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Top Toggle: Form Analytics | Site Analytics ── */}
      <div style={{
        display: "flex", background: T.grey100,
        borderRadius: 11, padding: 4,
        border: `1px solid ${T.grey200}`, gap: 2,
        width: "fit-content",
      }}>
        {[
          {
            key: "forms",
            label: "Form Analytics",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
            ),
          },
          {
            key: "sites",
            label: "Site Analytics",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            ),
          },
        ].map(({ key, label, icon }) => {
          const isActive = analyticsView === key;
          return (
            <button
              key={key}
              onClick={() => setAnalyticsView(key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 20px", borderRadius: 8, border: "none",
                background: isActive ? T.white : "transparent",
                color: isActive ? (key === "sites" ? T.red : T.text) : T.muted,
                fontWeight: isActive ? 700 : 500,
                fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Site Analytics ── */}
      {analyticsView === "sites" && <SiteAnalytics />}

      {/* ── Form Analytics ── */}
      {analyticsView === "forms" && (<>

      {/* ── Filters ── */}
      <div style={{
        background: T.white,
        borderRadius: 14,
        border: `1px solid ${T.grey200}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}>

        {/* Row 1: Month filter + Apply */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${T.grey200}`,
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
          background: T.white,
        }}>

          {/* Month picker group */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.muted,
              textTransform: "uppercase",
              letterSpacing: "0.7px",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}>
              {/* calendar icon */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              Filter by Month
            </label>

            {/* Input wrapper — handles focus ring via ref-less inline handlers on wrapper */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 38,
                padding: "0 10px 0 12px",
                borderRadius: 9,
                border: `1.5px solid ${T.grey200}`,
                background: T.grey100,
                transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
              }}
              onFocusCapture={(e) => {
                e.currentTarget.style.borderColor = T.red;
                e.currentTarget.style.background  = T.white;
                e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(204,0,0,0.09)";
              }}
              onBlurCapture={(e) => {
                e.currentTarget.style.borderColor = T.grey200;
                e.currentTarget.style.background  = T.grey100;
                e.currentTarget.style.boxShadow   = "none";
              }}
            >
              <input
                type="month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  fontSize: 13.5,
                  fontFamily: "'DM Sans', sans-serif",
                  color: monthYear ? T.text : T.muted,
                  cursor: "pointer",
                  minWidth: 140,
                  flex: 1,
                }}
              />

              {/* Inline clear button — only when a month is selected */}
              {monthYear && (
                <button
                  onClick={() => setMonthYear("")}
                  title="Clear"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    background: T.grey200,
                    color: T.muted,
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#D4D4D8";
                    e.currentTarget.style.color      = T.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = T.grey200;
                    e.currentTarget.style.color      = T.muted;
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Apply Filter button */}
          <button
            onClick={() => fetchAnalytics()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 38,
              padding: "0 20px",
              borderRadius: 9,
              border: "none",
              background: T.red,
              color: T.white,
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              transition: "background 0.15s, box-shadow 0.15s, transform 0.15s",
              letterSpacing: 0.1,
              whiteSpace: "nowrap",
              boxShadow: "0 1px 3px rgba(204,0,0,0.22)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background  = T.redDark;
              e.currentTarget.style.boxShadow   = "0 4px 14px rgba(204,0,0,0.28)";
              e.currentTarget.style.transform   = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background  = T.red;
              e.currentTarget.style.boxShadow   = "0 1px 3px rgba(204,0,0,0.22)";
              e.currentTarget.style.transform   = "none";
            }}
            onMouseDown={(e)  => { e.currentTarget.style.transform = "scale(0.98)"; }}
            onMouseUp={(e)    => { e.currentTarget.style.transform = "translateY(-1px)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Apply Filter
          </button>
        </div>

        {/* Row 2: View toggle */}
        <div style={{
          padding: "10px 20px",
          background: T.grey100,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.muted,
            textTransform: "uppercase",
            letterSpacing: "0.7px",
            marginRight: 4,
          }}>
            View
          </span>

          {[
            {
              label: "Form Analytics",
              value: false,
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                </svg>
              ),
            },
            {
              label: "Circle Analytics",
              value: true,
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              ),
            },
          ].map(({ label, value, icon }) => {
            const on = showCircleAnalytics === value;
            return (
              <button
                key={label}
                onClick={() => setShowCircleAnalytics(value)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 14px",
                  height: 32,
                  borderRadius: 7,
                  border: `1px solid ${on ? "rgba(204,0,0,0.22)" : T.grey200}`,
                  background: on ? "rgba(204,0,0,0.07)" : T.white,
                  color: on ? T.red : T.muted,
                  fontSize: 12.5,
                  fontWeight: on ? 700 : 500,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  transition: "all 0.14s ease",
                }}
                onMouseEnter={(e) => {
                  if (!on) {
                    e.currentTarget.style.borderColor = "rgba(204,0,0,0.18)";
                    e.currentTarget.style.color = T.red;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!on) {
                    e.currentTarget.style.borderColor = T.grey200;
                    e.currentTarget.style.color = T.muted;
                  }
                }}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Loader ── */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "spin 0.9s linear infinite" }} />
          <p style={{ color: T.muted, fontSize: 14, fontWeight: 500, margin: 0 }}>Loading analytics data…</p>
        </div>
      )}

      {/* ── No data ── */}
      {!loading && gridData.length === 0 && (
        <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "60px 20px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>No analytics data yet</p>
          <p style={{ fontSize: 13.5, color: T.muted, margin: 0 }}>Upload and validate a file first to see analytics here.</p>
        </div>
      )}

      {/* ── Tables ── */}
      {!loading && gridData.length > 0 && (
        !showCircleAnalytics ? (

          /* ══ Form Analytics Table ════════════════════════════ */
          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

            <div style={{
              padding: "18px 24px", borderBottom: `1px solid ${T.grey200}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>Form Analytics</h3>
                <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
                  Valid / Invalid (Total) per user per form — {allFormNames.length} form(s) tracked
                </p>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: searchFocused ? T.white : T.grey100,
                border: `1px solid ${searchFocused ? T.red : T.grey200}`,
                borderRadius: 9, padding: "7px 12px", width: 220,
                transition: "all 0.15s ease",
                boxShadow: searchFocused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  placeholder="Search username…"
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text }}
                />
              </div>
            </div>

            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 160 }}>Username</th>
                    {allFormNames.map((name) => {
                      const col   = colTotals[name] || { valid: 0, invalid: 0, total: 0 };
                      const rules = formRules[name];
                      const acc   = col.total ? Math.round((col.valid / col.total) * 100) : 0;
                      const accColor = acc >= 70 ? T.green : acc >= 40 ? T.orange : T.red;
                      return (
                        <th key={name} style={{ ...thStyle, textAlign: "center", minWidth: 140 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                            <span>{name}</span>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                              <span style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>{col.valid} valid</span>
                              <span style={{ fontSize: 10, color: T.muted }}>/</span>
                              <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>{col.invalid} invalid</span>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: accColor }}>
                              {col.total > 0 ? `${acc}% accuracy` : "No data"}
                            </span>
                            {rules && Object.keys(rules).length > 0 && (
                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                                {Object.entries(rules).slice(0, 3).map(([col, rule]) => (
                                  rule?.type && (
                                    <span key={col} style={{
                                      fontSize: 9.5, padding: "1px 5px", borderRadius: 4,
                                      background: T.blueBg, color: T.blue, fontWeight: 600,
                                      border: "1px solid rgba(37,99,235,0.15)",
                                      whiteSpace: "nowrap",
                                    }} title={`${col}: ${rule.type}`}>
                                      {rule.type}
                                    </span>
                                  )
                                ))}
                                {Object.keys(rules).length > 3 && (
                                  <span style={{ fontSize: 9.5, color: T.muted }}>+{Object.keys(rules).length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrid.map((row, i) => {
                    const totalValid   = Object.values(row.forms).reduce((s, f) => s + (f.valid   || 0), 0);
                    const totalInvalid = Object.values(row.forms).reduce((s, f) => s + (f.invalid || 0), 0);
                    const totalRows    = totalValid + totalInvalid;

                    return (
                      <tr
                        key={i}
                        style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(204,0,0,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: "50%",
                              background: T.redBg, display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.red, flexShrink: 0,
                            }}>
                              {(row.username || "?")[0]?.toUpperCase()}
                            </div>
                            {row.username}
                          </div>
                        </td>

                        {allFormNames.map((name) => {
                          const d = row.forms[name] || { valid: 0, invalid: 0, total: 0 };
                          return (
                            <td key={name} style={{ ...tdStyle, textAlign: "center" }}>
                              {d.total > 0 ? (
                                <>
                                  <span style={{ color: T.green, fontWeight: 700 }}>{d.valid}</span>
                                  <span style={{ color: T.muted, margin: "0 4px" }}>/</span>
                                  <span style={{ color: T.red, fontWeight: 700 }}>{d.invalid}</span>
                                  <div style={{ marginTop: 4 }}>
                                    <MiniAccuracy valid={d.valid} total={d.total} />
                                  </div>
                                </>
                              ) : (
                                <span style={{ color: T.grey200, fontSize: 12 }}>—</span>
                              )}
                            </td>
                          );
                        })}

                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{totalRows}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <MiniAccuracy valid={totalValid} total={totalRows} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.grey200}`, display: "flex", gap: 16, fontSize: 12, color: T.muted }}>
              <span><span style={{ color: T.green, fontWeight: 700 }}>Green</span> = Valid</span>
              <span><span style={{ color: T.red,   fontWeight: 700 }}>Red</span>   = Invalid</span>
              <span>Mini bars show per-cell accuracy</span>
            </div>
          </div>

        ) : (

          /* ══ Circle Analytics Tables ═══════════════════════════ */
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {circleSummary && Object.keys(circleSummary).length === 0 && (
              <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 14 }}>
                No circle-wise data available yet.
              </div>
            )}
            {circleSummary && Object.keys(circleSummary).map((formName) => {
              const entries    = Object.entries(circleSummary[formName] || {});
              const grandTotal = entries.reduce((s, [, c]) => s + c, 0);

              return (
                <div key={formName} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.grey200}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0 }}>{formName}</h3>
                      <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Circle-wise submissions</p>
                    </div>
                    <span style={{ padding: "4px 12px", borderRadius: 99, background: T.redBg, color: T.red, fontSize: 12.5, fontWeight: 600 }}>
                      {grandTotal.toLocaleString()} total
                    </span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Circle</th>
                          <th style={{ ...thStyle, textAlign: "center" }}>Submissions</th>
                          <th style={{ ...thStyle, textAlign: "left" }}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.sort(([, a], [, b]) => b - a).map(([circle, count], i) => {
                          const pct = grandTotal ? Math.round((count / grandTotal) * 100) : 0;
                          return (
                            <tr key={circle}
                              style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(204,0,0,0.03)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                            >
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{circle}</td>
                              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{count.toLocaleString()}</td>
                              <td style={tdStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.grey200, overflow: "hidden", maxWidth: 120 }}>
                                    <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: T.red, transition: "width 0.5s ease" }} />
                                  </div>
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, minWidth: 32 }}>{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      </>)}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default Analytics;
