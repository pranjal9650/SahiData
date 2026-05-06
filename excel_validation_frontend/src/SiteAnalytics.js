import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

const BASE_URL = "http://127.0.0.1:8000";

/* ─── Design tokens (identical to Analytics.js) ─────────────── */
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

/* ─── Table styles (identical to Analytics.js) ───────────────── */
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

/* ─── Main Component ─────────────────────────────────────────── */
function SiteAnalytics() {
  const [alarmList,      setAlarmList]      = useState([]);
  const [activeList,     setActiveList]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showCircleView, setShowCircleView] = useState(false);
  const [searchSite,     setSearchSite]     = useState("");
  const [circleFilter,   setCircleFilter]   = useState("All");
  const [searchFocused,  setSearchFocused]  = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [alarmRes, activeRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/SITE-ALARM-LIST`),
        axios.get(`${BASE_URL}/SITE-ACTIVE-LIST`),
      ]);
      if (alarmRes.status  === "fulfilled") setAlarmList(Array.isArray(alarmRes.value.data)  ? alarmRes.value.data  : []);
      if (activeRes.status === "fulfilled") setActiveList(Array.isArray(activeRes.value.data) ? activeRes.value.data : []);
    } catch (err) {
      console.error("Site analytics error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Derived: unique alarm types & circles ── */
  const allAlarmTypes = [...new Set(alarmList.map((r) => r.alarm_type).filter(Boolean))].sort();
  const allCircles    = [...new Set(alarmList.map((r) => r.circle).filter(Boolean))].sort();

  /* ── Active site IDs set ── */
  const activeSiteIds = new Set(activeList.map((r) => r.site_id).filter(Boolean));

  /* ── Aggregate: site_id → {site_name, circle, alarms:{type:count}, total} ── */
  const siteMap = {};
  alarmList.forEach((r) => {
    const id = r.global_id || r.site_name || "Unknown";
    if (!siteMap[id]) {
      siteMap[id] = {
        site_id:   r.global_id  || "—",
        site_name: r.site_name  || "—",
        circle:    r.circle     || "—",
        alarms:    {},
        total:     0,
      };
    }
    const type = r.alarm_type || "Unknown";
    siteMap[id].alarms[type] = (siteMap[id].alarms[type] || 0) + 1;
    siteMap[id].total += 1;
  });

  /* ── Column totals per alarm type ── */
  const colTotals = {};
  allAlarmTypes.forEach((type) => {
    colTotals[type] = alarmList.filter((r) => r.alarm_type === type).length;
  });

  /* ── Circle analytics: alarm_type → {circle: count} ── */
  const circleAlarmMap = {};
  alarmList.forEach((r) => {
    const type   = r.alarm_type || "Unknown";
    const circle = r.circle     || "Unknown";
    if (!circleAlarmMap[type])         circleAlarmMap[type] = {};
    if (!circleAlarmMap[type][circle]) circleAlarmMap[type][circle] = 0;
    circleAlarmMap[type][circle] += 1;
  });

  /* ── Build rows + apply filters ── */
  let siteRows = Object.values(siteMap);
  if (circleFilter !== "All") siteRows = siteRows.filter((r) => r.circle === circleFilter);
  if (searchSite) {
    const q = searchSite.toLowerCase();
    siteRows = siteRows.filter((r) =>
      r.site_id.toLowerCase().includes(q)   ||
      r.site_name.toLowerCase().includes(q) ||
      r.circle.toLowerCase().includes(q)
    );
  }
  siteRows.sort((a, b) => b.total - a.total);

  /* ── Reset filters ── */
  const resetFilters = () => { setCircleFilter("All"); setSearchSite(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Filter bar ── */}
      <div style={{
        background: T.white,
        borderRadius: 14,
        border: `1px solid ${T.grey200}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}>

        {/* Row 1: Circle filter + Reset */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${T.grey200}`,
          display: "flex", alignItems: "flex-end",
          gap: 12, flexWrap: "wrap",
          background: T.white,
        }}>

          {/* Circle dropdown — same wrapper style as month picker in Analytics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{
              fontSize: 11, fontWeight: 700, color: T.muted,
              textTransform: "uppercase", letterSpacing: "0.7px",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              Filter by Circle
            </label>

            <div
              style={{
                display: "flex", alignItems: "center",
                height: 38, padding: "0 10px 0 12px",
                borderRadius: 9, border: `1.5px solid ${T.grey200}`,
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
              <select
                value={circleFilter}
                onChange={(e) => setCircleFilter(e.target.value)}
                style={{
                  border: "none", background: "transparent",
                  outline: "none", fontSize: 13.5,
                  fontFamily: "'DM Sans', sans-serif",
                  color: T.text, cursor: "pointer",
                  minWidth: 160, flex: 1,
                }}
              >
                <option value="All">All Circles</option>
                {allCircles.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {circleFilter !== "All" && (
                <button
                  onClick={() => setCircleFilter("All")}
                  title="Clear"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 20, height: 20, borderRadius: "50%",
                    border: "none", background: T.grey200, color: T.muted,
                    cursor: "pointer", padding: 0, flexShrink: 0,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#D4D4D8"; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.grey200; e.currentTarget.style.color = T.muted; }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Reset button — same style as "Apply Filter" in Analytics */}
          <button
            onClick={resetFilters}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              height: 38, padding: "0 20px",
              borderRadius: 9, border: "none",
              background: T.red, color: T.white,
              fontSize: 13.5, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              transition: "background 0.15s, box-shadow 0.15s, transform 0.15s",
              letterSpacing: 0.1, whiteSpace: "nowrap",
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
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.86"/>
            </svg>
            Reset Filters
          </button>
        </div>

        {/* Row 2: View toggle — identical pattern to Analytics.js */}
        <div style={{
          padding: "10px 20px",
          background: T.grey100,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.muted,
            textTransform: "uppercase", letterSpacing: "0.7px", marginRight: 4,
          }}>
            View
          </span>

          {[
            {
              label: "Site-wise",
              value: false,
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                </svg>
              ),
            },
            {
              label: "Circle-wise",
              value: true,
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              ),
            },
          ].map(({ label, value, icon }) => {
            const on = showCircleView === value;
            return (
              <button
                key={label}
                onClick={() => setShowCircleView(value)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "0 14px", height: 32, borderRadius: 7,
                  border: `1px solid ${on ? "rgba(204,0,0,0.22)" : T.grey200}`,
                  background: on ? "rgba(204,0,0,0.07)" : T.white,
                  color: on ? T.red : T.muted,
                  fontSize: 12.5, fontWeight: on ? 700 : 500,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer", transition: "all 0.14s ease",
                }}
                onMouseEnter={(e) => {
                  if (!on) { e.currentTarget.style.borderColor = "rgba(204,0,0,0.18)"; e.currentTarget.style.color = T.red; }
                }}
                onMouseLeave={(e) => {
                  if (!on) { e.currentTarget.style.borderColor = T.grey200; e.currentTarget.style.color = T.muted; }
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
          <p style={{ color: T.muted, fontSize: 14, fontWeight: 500, margin: 0 }}>Loading site analytics…</p>
        </div>
      )}

      {/* ── No data ── */}
      {!loading && alarmList.length === 0 && (
        <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "60px 20px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>No site data available</p>
          <p style={{ fontSize: 13.5, color: T.muted, margin: 0 }}>Ensure the alarm report and site status files are present in the data folder.</p>
        </div>
      )}

      {/* ── Tables ── */}
      {!loading && alarmList.length > 0 && (
        !showCircleView ? (

          /* ══ Site-wise Table ═════════════════════════════════ */
          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

            {/* Card header with search */}
            <div style={{
              padding: "18px 24px", borderBottom: `1px solid ${T.grey200}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>Site Analytics</h3>
                <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2, marginBottom: 0 }}>
                  Alarm events per site per alarm type — {siteRows.length} site(s) · {allAlarmTypes.length} alarm type(s)
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: T.muted, marginTop: 6, flexWrap: "wrap" }}>
                  <span>Counts = alarm events over the <span style={{ fontWeight: 700 }}>last 1 month</span></span>
                  <span>·</span>
                  <span><span style={{ color: T.red, fontWeight: 700 }}>Red</span> ≥ 20 &nbsp;<span style={{ color: T.orange, fontWeight: 700 }}>Orange</span> ≥ 10</span>
                  <span>·</span>
                  <span><span style={{ color: T.green, fontWeight: 700 }}>Active</span> = site currently live in Site_Status</span>
                </div>
              </div>

              {/* Search — same style as Form Analytics search */}
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
                  placeholder="Search site…"
                  value={searchSite}
                  onChange={(e) => setSearchSite(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text }}
                />
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 700 }}>
                <thead>
                  <tr>
                    {/* Site column */}
                    <th style={{ ...thStyle, minWidth: 220 }}>Site</th>
                    <th style={{ ...thStyle, minWidth: 110 }}>Circle</th>

                    {/* One column per alarm type — mirrors form columns in Form Analytics */}
                    {allAlarmTypes.map((type) => {
                      const total = colTotals[type] || 0;
                      return (
                        <th key={type} style={{ ...thStyle, textAlign: "center", minWidth: 140 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                            <span>{type}</span>
                            <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>
                              {total.toLocaleString()} events
                            </span>
                          </div>
                        </th>
                      );
                    })}

                    <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((row, i) => {
                    const isActive = activeSiteIds.has(row.site_id);
                    return (
                      <tr
                        key={row.site_id + i}
                        style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(204,0,0,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                      >
                        {/* Site cell — avatar + ID + name, mirrors username cell */}
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: "50%",
                              background: T.redBg,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700, color: T.red, flexShrink: 0,
                            }}>
                              {(row.site_name || "S")[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{row.site_id}</div>
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 1, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {row.site_name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Circle */}
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 12, fontWeight: 600, color: T.purple,
                            background: T.purpleBg, padding: "2px 8px", borderRadius: 99,
                          }}>
                            {row.circle}
                          </span>
                        </td>

                        {/* Alarm type cells — mirrors form cells in Form Analytics */}
                        {allAlarmTypes.map((type) => {
                          const count = row.alarms[type] || 0;
                          return (
                            <td key={type} style={{ ...tdStyle, textAlign: "center" }}>
                              {count > 0 ? (
                                <span style={{
                                  fontWeight: 700,
                                  color: count >= 20 ? T.red : count >= 10 ? T.orange : T.text,
                                }}>
                                  {count}
                                </span>
                              ) : (
                                <span style={{ color: T.grey200, fontSize: 12 }}>—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Total */}
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                          {row.total}
                        </td>

                        {/* Status */}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{
                            fontSize: 11.5, fontWeight: 700,
                            color:      isActive ? T.green : T.red,
                            background: isActive ? T.greenBg : T.redBg,
                            padding: "3px 10px", borderRadius: 99,
                          }}>
                            {isActive ? "Active" : "In Alarm"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

        ) : (

          /* ══ Circle-wise Tables (one per alarm type) ══════════ */
          /* Mirrors the Circle Analytics section in Analytics.js  */
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {allAlarmTypes.length === 0 && (
              <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 14 }}>
                No circle-wise data available.
              </div>
            )}

            {allAlarmTypes.map((type) => {
              const circleData = circleAlarmMap[type] || {};
              const entries    = Object.entries(circleData).sort(([, a], [, b]) => b - a);
              const grandTotal = entries.reduce((s, [, c]) => s + c, 0);

              return (
                <div key={type} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

                  {/* Card header — same as circle analytics header in Analytics.js */}
                  <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.grey200}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0 }}>{type}</h3>
                      <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Circle-wise alarm distribution</p>
                    </div>
                    <span style={{ padding: "4px 12px", borderRadius: 99, background: T.redBg, color: T.red, fontSize: 12.5, fontWeight: 600 }}>
                      {grandTotal.toLocaleString()} total
                    </span>
                  </div>

                  {/* Table — same structure as circle analytics table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Circle</th>
                          <th style={{ ...thStyle, textAlign: "center" }}>Alarm Events</th>
                          <th style={{ ...thStyle, textAlign: "left" }}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(([circle, count], i) => {
                          const pct = grandTotal ? Math.round((count / grandTotal) * 100) : 0;
                          return (
                            <tr
                              key={circle}
                              style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(204,0,0,0.03)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                            >
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{circle}</td>
                              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                                {count.toLocaleString()}
                              </td>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default SiteAnalytics;
