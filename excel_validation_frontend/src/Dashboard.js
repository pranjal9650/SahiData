import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  FileSpreadsheet, Rows3, CheckCircle2, XCircle, TrendingUp,
  TrendingDown, User, ChevronDown, ChevronUp,
  AlertTriangle, X, MapPin, Search,
} from "lucide-react";
import SiteDashboard from "./SiteDashboard";

import API_BASE from "./config";
const BASE_URL = API_BASE;

const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  black:    "#111111",
  border:   "#E5E2DC",
  surface:  "#F2F0EB",
  pageBg:   "#F7F5F0",
  white:    "#FFFFFF",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.09)",
  redBg:    "rgba(204,0,0,0.08)",
  warmBg:   "rgba(107,114,128,0.08)",
  warm:     "#6B7280",
  purple:   "#7C3AED",
  purpleBg: "rgba(124,58,237,0.08)",
  text:     "#111111",
  muted:    "#6B7280",
};

/* ─── Stat card ──────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, accent, bg, trend, trendLabel }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.white,
        borderRadius: 14,
        border: `1px solid ${T.border}`,
        padding: "20px",
        display: "flex", flexDirection: "column",
        justifyContent: "space-between", gap: 12,
        position: "relative", overflow: "hidden",
        transition: "all 0.18s ease",
        boxShadow: hovered ? "0 8px 28px rgba(0,0,0,0.09)" : "0 1px 6px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "none",
        cursor: "default", height: "100%", boxSizing: "border-box",
      }}
    >
      {/* Top accent stripe */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 3, background: accent, borderRadius: "14px 14px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: T.muted,
          textTransform: "uppercase", letterSpacing: "0.7px",
        }}>
          {label}
        </span>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={16} color={accent} />
        </div>
      </div>
      <div style={{
        fontSize: 28, fontWeight: 800, color: T.text,
        lineHeight: 1, letterSpacing: "-1px",
      }}>
        {value ?? "—"}
      </div>
      {trend !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {trend >= 0
            ? <TrendingUp size={12} color={T.green} />
            : <TrendingDown size={12} color={T.red} />
          }
          <span style={{ fontSize: 11.5, fontWeight: 600, color: trend >= 0 ? T.green : T.red }}>
            {Math.abs(trend)}%
          </span>
          <span style={{ fontSize: 11.5, color: T.muted }}>{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Custom tooltip ─────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: "10px 14px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.09)",
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
    }}>
      <p style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill, fontWeight: 600, margin: "2px 0" }}>
          {p.name}: <span style={{ color: T.text }}>{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Per-user row — expandable ──────────────────────────────── */
function UserRow({ user, index, onViewRecords }) {
  const totalValid   = Object.values(user.forms || {}).reduce((s, f) => s + (f.valid   || 0), 0);
  const totalInvalid = Object.values(user.forms || {}).reduce((s, f) => s + (f.invalid || 0), 0);
  const totalRows    = totalValid + totalInvalid;
  const accuracy     = totalRows ? Math.round((totalValid / totalRows) * 100) : 0;

  const formEntries = Object.entries(user.forms || {}).filter(([, d]) => (d?.valid || 0) + (d?.invalid || 0) > 0);

  return (
    <tr style={{ background: index % 2 === 0 ? T.white : "#FAFAF8" }}>

      {/* Username */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(204,0,0,0.10)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: T.red, flexShrink: 0,
          }}>
            {(user.username || "?")[0].toUpperCase()}
          </div>
          <span style={{ fontWeight: 600, color: T.text, fontSize: 13.5 }}>{user.username}</span>
        </div>
      </td>

      {/* Total rows */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, textAlign: "center", verticalAlign: "middle" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{totalRows.toLocaleString()}</span>
      </td>

      {/* Valid */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, textAlign: "center", verticalAlign: "middle" }}>
        <span style={{ color: T.green, fontWeight: 600, background: T.greenBg, padding: "3px 10px", borderRadius: 99, fontSize: 12.5 }}>
          {totalValid.toLocaleString()}
        </span>
      </td>

      {/* Invalid */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, textAlign: "center", verticalAlign: "middle" }}>
        <span style={{ color: T.red, fontWeight: 600, background: T.redBg, padding: "3px 10px", borderRadius: 99, fontSize: 12.5 }}>
          {totalInvalid.toLocaleString()}
        </span>
      </td>

      {/* Accuracy */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.border, overflow: "hidden", maxWidth: 90 }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${accuracy}%`,
              background: accuracy >= 70 ? T.green : accuracy >= 40 ? "#D97706" : T.red,
              transition: "width 0.6s ease",
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: accuracy >= 70 ? T.green : accuracy >= 40 ? "#D97706" : T.red, minWidth: 34 }}>
            {accuracy}%
          </span>
        </div>
      </td>

      {/* Form Breakdown */}
      <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" }}>
        {formEntries.length === 0
          ? <span style={{ fontSize: 12, color: T.muted }}>—</span>
          : <table style={{ borderCollapse: "collapse", tableLayout: "auto" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: "0 20px 5px 0", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "left", whiteSpace: "nowrap" }}>Form</th>
                  <th style={{ padding: "0 8px 5px", fontSize: 10, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", width: 64, whiteSpace: "nowrap" }}>Valid</th>
                  <th style={{ padding: "0 0 5px 8px", fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", width: 72, whiteSpace: "nowrap" }}>Invalid</th>
                </tr>
              </thead>
              <tbody>
                {formEntries.map(([formName, d]) => {
                  const v   = d?.valid   || 0;
                  const inv = d?.invalid || 0;
                  return (
                    <tr key={formName}>
                      <td style={{ padding: "4px 20px 4px 0", fontSize: 12.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>
                        {formName}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                        <span
                          onClick={() => onViewRecords(user.username, formName, "valid", v)}
                          style={{
                            display: "inline-block",
                            fontSize: 11.5, color: T.green, fontWeight: 700,
                            background: T.greenBg, padding: "2px 10px", borderRadius: 99,
                            cursor: v > 0 ? "pointer" : "default",
                            opacity: v > 0 ? 1 : 0.45,
                            border: "1px solid transparent",
                            transition: "border-color 0.15s",
                            userSelect: "none", minWidth: 32,
                          }}
                          onMouseEnter={(e) => { if (v > 0) e.currentTarget.style.borderColor = T.green; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
                          title={v > 0 ? `Click to see ${v} valid records` : "No valid records"}
                        >
                          {v}
                        </span>
                      </td>
                      <td style={{ padding: "4px 0 4px 8px", textAlign: "center" }}>
                        <span
                          onClick={() => onViewRecords(user.username, formName, "invalid", inv)}
                          style={{
                            display: "inline-block",
                            fontSize: 11.5, color: T.red, fontWeight: 700,
                            background: T.redBg, padding: "2px 10px", borderRadius: 99,
                            cursor: inv > 0 ? "pointer" : "default",
                            opacity: inv > 0 ? 1 : 0.45,
                            border: "1px solid transparent",
                            transition: "border-color 0.15s",
                            userSelect: "none", minWidth: 32,
                          }}
                          onMouseEnter={(e) => { if (inv > 0) e.currentTarget.style.borderColor = T.red; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
                          title={inv > 0 ? `Click to see ${inv} invalid records` : "No invalid records"}
                        >
                          {inv}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </td>
    </tr>
  );
}
const Dashboard = () => {
const [dashView, setDashView]   = useState("forms");
  const [stats, setStats]         = useState(null);
  const [chartData, setChartData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [userData, setUserData]   = useState([]);
  const [userSearch,    setUserSearch]    = useState("");

  const [recordsModal,   setRecordsModal]   = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsData,    setRecordsData]    = useState(null);
  const [recordsCtx,     setRecordsCtx]     = useState(null); // {username, formName, status}
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [invalidModal, setInvalidModal]       = useState(false);
  const [invalidFormName, setInvalidFormName] = useState("");
  const [invalidRecords, setInvalidRecords]   = useState([]);
  const [invalidLoading, setInvalidLoading]   = useState(false);

  const [validModal, setValidModal]       = useState(false);
  const [validFormName, setValidFormName] = useState("");
  const [validRecords, setValidRecords]   = useState([]);
  const [validLoading, setValidLoading]   = useState(false);

  const [expandedUser, setExpandedUser] = useState(null);

  const handleViewInvalid = async (formName) => {
    setInvalidFormName(formName);
    setInvalidModal(true);
    setInvalidLoading(true);
    setInvalidRecords([]);
    setExpandedUser(null);
    try {
      const res = await axios.get(`${BASE_URL}/INVALID-RECORDS-BY-USER`, {
        params: { form_name: formName }
      });
      setInvalidRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch invalid records:", err);
      setInvalidRecords([]);
    }
    setInvalidLoading(false);
  };

  const handleViewValid = async (formName) => {
    setValidFormName(formName);
    setValidModal(true);
    setValidLoading(true);
    setValidRecords([]);
    try {
      const res = await axios.get(`${BASE_URL}/VALID-RECORDS-BY-USER`, {
        params: { form_name: formName }
      });
      setValidRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch valid records:", err);
      setValidRecords([]);
    }
    setValidLoading(false);
  };

  const handleViewUserRecords = async (username, formName, status, count) => {
    if (count === 0) return;
    setRecordsCtx({ username, formName, status });
    setRecordsModal(true);
    setRecordsLoading(true);
    setRecordsData(null);
    try {
      const res = await axios.get(`${BASE_URL}/USER-FORM-RECORDS`, {
        params: { username, form_name: formName, status },
      });
      setRecordsData(res.data);
    } catch (err) {
      console.error("Failed to fetch user records:", err);
      setRecordsData({ total: 0, columns: [], rows: [] });
    }
    setRecordsLoading(false);
  };

  const fetchAll = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const bust = Date.now();
      const [dashRes, analyticsRes] = await Promise.all([
        axios.get(`${BASE_URL}/DASHBOARD-DATA`,    { params: { _t: bust } }),
        axios.get(`${BASE_URL}/ANALYTICS`,         { params: { _t: bust } }),
      ]);
      setStats(dashRes.data);
      processAnalytics(analyticsRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    /* clear the localStorage signal so we don't re-fetch again unnecessarily */
    localStorage.removeItem("rulesUpdatedAt");
  }, [fetchAll]);

  useEffect(() => {
    const handler = () => {
      fetchAll();
      localStorage.removeItem("rulesUpdatedAt");
    };
    window.addEventListener("rulesUpdated", handler);
    return () => window.removeEventListener("rulesUpdated", handler);
  }, [fetchAll]);

  const processAnalytics = (data) => {
    if (!Array.isArray(data)) return;
    const formMap      = {};
    data.forEach((user) => {
      Object.keys(user.forms || {}).forEach((name) => {
        const d       = user.forms[name];
        const valid   = Number(d?.valid   || 0);
        const invalid = Number(d?.invalid || 0);
        const total   = Number(d?.total   || valid + invalid);
        if (!formMap[name]) formMap[name] = { valid: 0, invalid: 0, total: 0 };
        formMap[name].valid   += valid;
        formMap[name].invalid += invalid;
        formMap[name].total   += total;
      });
    });
    const built = Object.entries(formMap).map(([name, s]) => ({
      name,
      Valid:   Number(s.valid   || 0),
      Invalid: Number(s.invalid || 0),
      total:   Number(s.total   || 0),
    }));
    setChartData(built);
    setTableData(built);
    setUserData(data);
  };

  const {
    total_forms = 0,
    total_rows  = 0,
    valid_rows  = 0,
    junk_rows   = 0,
  } = stats || {};

  const validPct     = total_rows ? Math.round((valid_rows / total_rows) * 100) : 0;
  const formsTrend   = total_forms || 0;
  const rowsTrend    = total_rows ? Math.round((valid_rows / total_rows) * 100) : 0;
  const invalidTrend = total_rows ? Math.round((junk_rows / total_rows) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Dashboard Toggle ── */}
      <div style={{
        display: "flex", background: T.surface,
        borderRadius: 11, padding: 4,
        border: `1px solid ${T.border}`, gap: 2,
        width: "fit-content",
      }}>
        {[
          { key: "forms", label: "Forms Dashboard", icon: FileSpreadsheet },
          { key: "sites", label: "Site Dashboard",  icon: MapPin },
        ].map(({ key, label, icon: Icon }) => {
          const isActive = dashView === key;
          return (
            <button
              key={key}
              onClick={() => setDashView(key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 20px", borderRadius: 8,
                border: "none",
                background: isActive ? T.white : "transparent",
                color: isActive ? (key === "sites" ? T.red : T.text) : T.muted,
                fontWeight: isActive ? 700 : 500,
                fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Site Dashboard ── */}
      {dashView === "sites" && <SiteDashboard />}

      {/* ── Forms Dashboard: loading ── */}
      {dashView === "forms" && loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${T.border}`, borderTop: `3px solid ${T.red}`, animation: "spin 0.9s linear infinite" }} />
          <p style={{ color: T.muted, fontSize: 14, fontWeight: 500 }}>Loading dashboard…</p>
        </div>
      )}

      {/* ── Forms Dashboard ── */}
      {dashView === "forms" && !loading && (<>

      {/* ── Topbar: title + refresh ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>Dashboard</h2>
          {lastUpdated && (
            <p style={{ fontSize: 12, color: T.muted, margin: "3px 0 0" }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 16px", borderRadius: 9,
            border: `1px solid ${T.border}`,
            background: refreshing ? T.surface : T.white,
            color: refreshing ? T.muted : T.text,
            fontSize: 13, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: refreshing ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
          onMouseEnter={(e) => { if (!refreshing) { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = refreshing ? T.muted : T.text; }}
        >
          {refreshing ? (
            <>
              <div style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${T.border}`, borderTop: `2px solid ${T.red}`, animation: "spin 0.75s linear infinite" }} />
              Refreshing…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.86"/>
              </svg>
              Refresh Data
            </>
          )}
        </button>
      </div>

      {/* ── Invalid Records Modal ── */}
      {invalidModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.48)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            background: T.white, borderRadius: 18,
            width: "100%", maxWidth: 860,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}>

            {/* Modal Header */}
            <div style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center",
              justifyContent: "space-between", flexShrink: 0,
              background: T.white,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(204,0,0,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <XCircle size={18} color={T.red} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>
                    Invalid Records
                  </h3>
                  <p style={{ fontSize: 12.5, color: T.muted, margin: 0, lineHeight: 1.4 }}>
                    {invalidFormName} — showing why each record was rejected
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInvalidModal(false)}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.14s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.border; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; }}
              >
                <X size={16} color={T.muted} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 28px 24px" }}>

              {invalidLoading ? (
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "center", height: 200, gap: 12,
                  flexDirection: "column",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    border: `3px solid ${T.border}`,
                    borderTop: `3px solid ${T.red}`,
                    animation: "spin 0.9s linear infinite",
                  }} />
                  <p style={{ color: T.muted, fontSize: 13.5 }}>Loading invalid records…</p>
                </div>

              ) : invalidRecords.length === 0 ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: 200, flexDirection: "column", gap: 10,
                }}>
                  <CheckCircle2 size={40} color={T.green} />
                  <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>
                    No invalid records found or data not available.
                  </p>
                </div>

              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Summary strip */}
                  <div style={{
                    padding: "10px 16px", borderRadius: 10,
                    background: "rgba(204,0,0,0.06)",
                    border: "1px solid rgba(204,0,0,0.14)",
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 6,
                  }}>
                    <AlertTriangle size={14} color={T.red} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.red }}>
                      {invalidRecords.length} user{invalidRecords.length !== 1 ? "s" : ""} with invalid entries
                    </span>
                    <span style={{ fontSize: 12.5, color: T.muted, marginLeft: 4 }}>
                      — review the rejection reasons below
                    </span>
                  </div>

                  {/* Records list — user-wise */}
                  {invalidRecords.map((userRecord, i) => {
                    const isExpanded = expandedUser === userRecord.username;
                    return (
                      <div key={i} style={{
                        borderRadius: 12,
                        border: `1px solid ${T.border}`,
                        background: T.white,
                        overflow: "hidden",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}>

                        {/* User header */}
                        <div style={{
                          padding: "14px 18px",
                          background: "rgba(204,0,0,0.04)",
                          borderBottom: "1px solid rgba(204,0,0,0.10)",
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: "rgba(204,0,0,0.10)",
                              border: "2px solid rgba(204,0,0,0.18)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 800, color: T.red, flexShrink: 0,
                            }}>
                              {(userRecord.username || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>
                                {userRecord.username}
                              </p>
                              <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.4 }}>
                                {userRecord.total_invalid} invalid entr{userRecord.total_invalid !== 1 ? "ies" : "y"}
                                &nbsp;·&nbsp; {userRecord.field_summary?.length || 0} field{(userRecord.field_summary?.length || 0) !== 1 ? "s" : ""} affected
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Field-wise breakdown — always visible */}
                        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>

                          <p style={{
                            fontSize: 11, fontWeight: 700, color: T.muted,
                            textTransform: "uppercase", letterSpacing: "0.6px", margin: 0,
                          }}>
                            Field-wise Failure Breakdown
                          </p>

                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {(userRecord.field_summary || []).map((fs, j) => (
                              <div key={j} style={{
                                display: "flex", alignItems: "flex-start",
                                gap: 12, padding: "10px 14px", borderRadius: 9,
                                background: T.pageBg, border: `1px solid ${T.border}`,
                              }}>
                                <XCircle size={14} color={T.red} style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                                      {fs.field}
                                    </span>
                                    <span style={{
                                      fontSize: 11.5, fontWeight: 700,
                                      background: T.redBg, color: T.red,
                                      padding: "1px 8px", borderRadius: 99,
                                      border: "1px solid rgba(204,0,0,0.15)",
                                    }}>
                                      {fs.fail_count} failure{fs.fail_count !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                  {fs.sample_values?.length > 0 && (
                                    <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>
                                      Sample bad values:&nbsp;
                                      {fs.sample_values.map((v, k) => (
                                        <span key={k} style={{
                                          background: T.white,
                                          border: `1px solid ${T.border}`,
                                          borderRadius: 5, padding: "1px 7px",
                                          fontSize: 11.5, fontWeight: 600,
                                          color: T.text, marginRight: 4,
                                        }}>
                                          "{v}"
                                        </span>
                                      ))}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Sample rows — behind a toggle (structured errors) */}
                          {userRecord.sample_errors?.length > 0 && (
                            <>
                              <button
                                onClick={() => setExpandedUser(isExpanded ? null : userRecord.username)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "none", border: `1px solid ${T.border}`,
                                  borderRadius: 7, padding: "5px 12px",
                                  fontSize: 12, fontWeight: 600, color: T.muted,
                                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                                  width: "fit-content", marginTop: 2,
                                }}
                              >
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? "Hide" : "Show"} sample invalid rows
                              </button>
                              {isExpanded && userRecord.sample_errors.map((rec, k) => (
                                <div key={k} style={{
                                  borderRadius: 8, overflow: "hidden",
                                  border: "1px solid rgba(204,0,0,0.15)",
                                  borderLeft: `3px solid ${T.red}`,
                                }}>
                                  <div style={{
                                    padding: "7px 12px",
                                    background: "rgba(204,0,0,0.06)",
                                    fontSize: 12, fontWeight: 700, color: T.red,
                                  }}>
                                    Row {rec.row_number}
                                  </div>
                                  <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                                    {rec.errors.map((err, m) => (
                                      <div key={m} style={{
                                        display: "flex", alignItems: "flex-start", gap: 8,
                                        fontSize: 12.5, color: T.text,
                                      }}>
                                        <span style={{ fontWeight: 700, minWidth: 120, color: T.muted }}>
                                          {err.field}:
                                        </span>
                                        <span style={{
                                          background: T.redBg, color: T.red,
                                          padding: "0px 6px", borderRadius: 5,
                                          fontWeight: 600, fontSize: 12,
                                        }}>
                                          "{err.value}"
                                        </span>
                                        <span style={{ color: T.muted, fontSize: 12 }}>
                                          — {err.reason}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}

                          {/* Raw sample rows fallback — when specific errors aren't available */}
                          {!userRecord.sample_errors?.length && userRecord.raw_samples?.length > 0 && (
                            <>
                              <button
                                onClick={() => setExpandedUser(isExpanded ? null : userRecord.username)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "none", border: `1px solid ${T.border}`,
                                  borderRadius: 7, padding: "5px 12px",
                                  fontSize: 12, fontWeight: 600, color: T.muted,
                                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                                  width: "fit-content", marginTop: 2,
                                }}
                              >
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? "Hide" : "Show"} sample rows
                              </button>
                              {isExpanded && userRecord.raw_samples.map((rec, k) => (
                                <div key={k} style={{
                                  borderRadius: 8, overflow: "hidden",
                                  border: "1px solid rgba(204,0,0,0.15)",
                                  borderLeft: `3px solid ${T.red}`,
                                }}>
                                  <div style={{
                                    padding: "7px 12px",
                                    background: "rgba(204,0,0,0.06)",
                                    fontSize: 12, fontWeight: 700, color: T.red,
                                  }}>
                                    Row {rec.row_number}
                                  </div>
                                  <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                                    {Object.entries(rec.data || {}).map(([field, val], m) => (
                                      <div key={m} style={{
                                        display: "flex", alignItems: "flex-start", gap: 8,
                                        fontSize: 12.5, color: T.text,
                                      }}>
                                        <span style={{ fontWeight: 700, minWidth: 140, color: T.muted, flexShrink: 0 }}>
                                          {field}:
                                        </span>
                                        <span style={{ color: T.text, fontSize: 12 }}>{val}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Valid Records Modal ── */}
      {validModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.48)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            background: T.white, borderRadius: 18,
            width: "100%", maxWidth: 860,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center",
              justifyContent: "space-between", flexShrink: 0,
              background: T.white,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: T.greenBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CheckCircle2 size={18} color={T.green} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>
                    Valid Records
                  </h3>
                  <p style={{ fontSize: 12.5, color: T.muted, margin: 0, lineHeight: 1.4 }}>
                    {validFormName} — per-user valid entries
                  </p>
                </div>
              </div>
              <button
                onClick={() => setValidModal(false)}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.surface, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.14s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.border; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; }}
              >
                <X size={16} color={T.muted} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 28px 24px" }}>
              {validLoading ? (
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "center", height: 200, gap: 12,
                  flexDirection: "column",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    border: `3px solid ${T.border}`,
                    borderTop: `3px solid ${T.green}`,
                    animation: "spin 0.9s linear infinite",
                  }} />
                  <p style={{ color: T.muted, fontSize: 13.5 }}>Loading valid records…</p>
                </div>

              ) : validRecords.length === 0 ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: 200, flexDirection: "column", gap: 10,
                }}>
                  <XCircle size={40} color={T.muted} />
                  <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>No valid records found.</p>
                </div>

              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Summary strip */}
                  <div style={{
                    padding: "10px 16px", borderRadius: 10,
                    background: T.greenBg,
                    border: "1px solid rgba(5,150,105,0.18)",
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 6,
                  }}>
                    <CheckCircle2 size={14} color={T.green} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>
                      {validRecords.length} user{validRecords.length !== 1 ? "s" : ""} with valid entries
                    </span>
                    <span style={{ fontSize: 12.5, color: T.muted, marginLeft: 4 }}>
                      — all records passed validation
                    </span>
                  </div>

                  {/* Per-user cards */}
                  {validRecords.map((userRecord, i) => {
                    const isExpanded = expandedUser === userRecord.username;
                    return (
                      <div key={i} style={{
                        borderRadius: 12,
                        border: `1px solid ${T.border}`,
                        background: T.white,
                        overflow: "hidden",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}>

                        {/* User header */}
                        <div style={{
                          padding: "14px 18px",
                          background: "rgba(5,150,105,0.04)",
                          borderBottom: "1px solid rgba(5,150,105,0.10)",
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: T.greenBg,
                              border: "2px solid rgba(5,150,105,0.20)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 800, color: T.green, flexShrink: 0,
                            }}>
                              {(userRecord.username || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>
                                {userRecord.username}
                              </p>
                              <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.4 }}>
                                {userRecord.total_valid} valid entr{userRecord.total_valid !== 1 ? "ies" : "y"}
                              </p>
                            </div>
                          </div>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            background: T.greenBg,
                            border: "1px solid rgba(5,150,105,0.20)",
                            color: T.green, padding: "3px 12px", borderRadius: 99,
                          }}>
                            ✓ {userRecord.total_valid.toLocaleString()} valid
                          </span>
                        </div>

                        {/* Sample rows — behind toggle */}
                        {userRecord.sample_rows?.length > 0 && (
                          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <button
                              onClick={() => setExpandedUser(isExpanded ? null : userRecord.username)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                background: "none", border: `1px solid ${T.border}`,
                                borderRadius: 7, padding: "5px 12px",
                                fontSize: 12, fontWeight: 600, color: T.muted,
                                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                                width: "fit-content",
                              }}
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {isExpanded ? "Hide" : "Show"} sample valid rows
                            </button>

                            {isExpanded && userRecord.sample_rows.map((rec, k) => (
                              <div key={k} style={{
                                borderRadius: 8, overflow: "hidden",
                                border: "1px solid rgba(5,150,105,0.18)",
                                borderLeft: `3px solid ${T.green}`,
                              }}>
                                <div style={{
                                  padding: "7px 12px",
                                  background: "rgba(5,150,105,0.06)",
                                  fontSize: 12, fontWeight: 700, color: T.green,
                                }}>
                                  Row {rec.row_number}
                                </div>
                                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                                  {Object.entries(rec.data || {}).map(([field, val], m) => (
                                    <div key={m} style={{
                                      display: "flex", alignItems: "flex-start", gap: 8,
                                      fontSize: 12.5, color: T.text,
                                    }}>
                                      <span style={{ fontWeight: 700, minWidth: 160, color: T.muted, flexShrink: 0 }}>
                                        {field}:
                                      </span>
                                      <span style={{ color: T.text, fontSize: 12 }}>{val}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── User Form Records Modal ── */}
      {recordsModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.52)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, fontFamily: "'DM Sans', sans-serif",
        }} onClick={() => setRecordsModal(false)}>
          <div style={{
            background: T.white, borderRadius: 18,
            width: "100%", maxWidth: 1000,
            maxHeight: "88vh", display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.20)",
            overflow: "hidden",
          }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center",
              justifyContent: "space-between", flexShrink: 0,
              background: T.white,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: recordsCtx?.status === "invalid" ? "rgba(204,0,0,0.07)" : "rgba(5,150,105,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {recordsCtx?.status === "invalid"
                    ? <XCircle size={18} color={T.red} />
                    : <CheckCircle2 size={18} color={T.green} />
                  }
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>
                    {recordsCtx?.username} — {recordsCtx?.formName}
                  </h3>
                  <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
                    {recordsCtx?.status === "invalid" ? "Invalid" : "Valid"} records
                    {recordsData ? ` — ${recordsData.total} row${recordsData.total !== 1 ? "s" : ""}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRecordsModal(false)}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.surface,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.border; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; }}
              >
                <X size={16} color={T.muted} />
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {recordsLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, flexDirection: "column", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    border: `3px solid ${T.border}`,
                    borderTop: `3px solid ${recordsCtx?.status === "invalid" ? T.red : T.green}`,
                    animation: "spin 0.9s linear infinite",
                  }} />
                  <p style={{ color: T.muted, fontSize: 13.5 }}>Loading records…</p>
                </div>
              ) : !recordsData || recordsData.total === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, flexDirection: "column", gap: 8 }}>
                  <AlertTriangle size={32} color={T.muted} />
                  <p style={{ color: T.muted, fontSize: 14 }}>No records found</p>
                  <p style={{ color: T.muted, fontSize: 12 }}>The source file may have been removed or re-uploaded</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: T.pageBg, position: "sticky", top: 0, zIndex: 1 }}>
                        <th style={{ padding: "10px 14px", textAlign: "center", fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", minWidth: 52 }}>#</th>
                        {recordsData.columns.map((col) => (
                          <th key={col} style={{
                            padding: "10px 14px", textAlign: "left",
                            fontSize: 10.5, fontWeight: 700, color: T.muted,
                            textTransform: "uppercase", letterSpacing: "0.5px",
                            borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recordsData.rows.map((rec, ri) => (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? T.white : "#FAFAF8" }}>
                          <td style={{ padding: "9px 14px", borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: "center", fontSize: 11.5, fontFamily: "monospace" }}>
                            {rec.row_number}
                          </td>
                          {recordsData.columns.map((col) => (
                            <td key={col} style={{
                              padding: "9px 14px", borderBottom: `1px solid ${T.border}`,
                              color: rec.data[col] ? T.text : T.muted,
                              fontStyle: rec.data[col] ? "normal" : "italic",
                              whiteSpace: "nowrap", maxWidth: 260,
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {rec.data[col] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main row: KPI stack (left) + Chart (right) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "stretch" }}>

        {/* Left: 4 KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 14, height: "100%" }}>
          <StatCard
            label="Total Forms"
            value={total_forms.toLocaleString()}
            icon={FileSpreadsheet}
            accent={T.warm}
            bg={T.warmBg}
            trend={formsTrend}
            trendLabel={`form${total_forms !== 1 ? "s" : ""} uploaded`}
          />
          <StatCard
            label="Total Rows"
            value={total_rows.toLocaleString()}
            icon={Rows3}
            accent="#7C3AED"
            bg="rgba(124,58,237,0.08)"
            trend={rowsTrend}
            trendLabel="valid row rate"
          />
          <StatCard
            label="Valid Rows"
            value={valid_rows.toLocaleString()}
            icon={CheckCircle2}
            accent={T.green}
            bg={T.greenBg}
            trend={validPct}
            trendLabel="accuracy rate"
          />
          <StatCard
            label="Invalid Rows"
            value={junk_rows.toLocaleString()}
            icon={XCircle}
            accent={T.red}
            bg={T.redBg}
            trend={invalidTrend}
            trendLabel="invalid row rate"
          />
        </div>

        {/* Right: Bar chart */}
        <div style={{
          background: T.white, borderRadius: 14,
          border: `1px solid ${T.border}`,
          padding: "20px 24px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 14,
            borderBottom: `1px solid ${T.border}`,
            marginBottom: 20,
          }}>
            <div>
              <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.3px" }}>
                Form-wise Validation Distribution
              </h3>
              <p style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                Valid vs Invalid rows per form type
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Valid",   color: T.green, bg: T.greenBg },
                { label: "Invalid", color: T.red,   bg: T.redBg },
              ].map(({ label, color, bg }) => (
                <span key={label} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 99,
                  background: bg, fontSize: 12, fontWeight: 600, color,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div style={{
              height: 240, display: "flex", alignItems: "center",
              justifyContent: "center", flexDirection: "column",
              gap: 10, color: T.muted, fontSize: 14,
            }}>
              <FileSpreadsheet size={32} color={T.border} />
              <p style={{ margin: 0 }}>No data yet — upload a file to see analytics</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={{ stroke: T.border }}
                  tickLine={false}
                  interval={0}
                  dy={12}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.025)" }} />
                <Bar dataKey="Valid"   name="Valid"   fill={T.green} radius={[5, 5, 0, 0]} maxBarSize={44} />
                <Bar dataKey="Invalid" name="Invalid" fill={T.red}   radius={[5, 5, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Form summary table ── */}
      {tableData.length > 0 && (
        <div style={{
          background: T.white, borderRadius: 16,
          border: `1px solid ${T.border}`,
          overflow: "hidden",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Card header */}
          <div style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.2px" }}>
                Form Summary
              </h3>
              <span style={{
                fontSize: 11, fontWeight: 600, color: T.muted,
                background: T.pageBg, border: `1px solid ${T.border}`,
                padding: "2px 8px", borderRadius: 99,
              }}>
                {tableData.length} forms
              </span>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "#FAFAF9" }}>
                  {[
                    { label: "Form Name", align: "left" },
                    { label: "Total Records", align: "right" },
                    { label: "Accuracy", align: "left" },
                    { label: "Valid Records", align: "center" },
                    { label: "Invalid Records", align: "center" },
                  ].map((h) => (
                    <th key={h.label} style={{
                      padding: "11px 20px",
                      textAlign: h.align,
                      fontSize: 11, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.7px",
                      color: "#9CA3AF",
                      borderBottom: `1px solid ${T.border}`,
                      whiteSpace: "nowrap",
                    }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => {
                  const acc = row.total ? Math.round((row.Valid / row.total) * 100) : 0;
                  const barColor = acc >= 80 ? T.green : acc >= 50 ? "#F59E0B" : T.red;
                  const isLast = i === tableData.length - 1;
                  return (
                    <tr
                      key={row.name}
                      style={{ background: T.white, transition: "background 0.12s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF9")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
                    >
                      {/* Form name */}
                      <td style={{
                        padding: "14px 20px",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                            background: acc >= 80 ? T.green : acc >= 50 ? "#F59E0B" : T.red,
                          }} />
                          <span style={{ fontWeight: 600, color: T.text, fontSize: 13.5 }}>
                            {row.name}
                          </span>
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{
                        padding: "14px 20px", textAlign: "right",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                        color: T.text, fontWeight: 500, fontSize: 13.5,
                      }}>
                        {row.total.toLocaleString()}
                      </td>

                      {/* Accuracy bar */}
                      <td style={{
                        padding: "14px 20px",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                        minWidth: 150,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            flex: 1, height: 5, borderRadius: 99,
                            background: "#F0EFEC", overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%", borderRadius: 99,
                              width: `${acc}%`,
                              background: barColor,
                              transition: "width 0.8s ease",
                            }} />
                          </div>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: barColor,
                            minWidth: 34, textAlign: "right",
                          }}>
                            {acc}%
                          </span>
                        </div>
                      </td>

                      {/* Valid Records button */}
                      <td style={{
                        padding: "14px 20px", textAlign: "center",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                      }}>
                        <button
                          onClick={() => handleViewValid(row.name)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 14px", borderRadius: 8,
                            background: "rgba(5,150,105,0.07)",
                            border: "1px solid rgba(5,150,105,0.2)",
                            color: T.green, fontWeight: 700, fontSize: 13,
                            fontFamily: "'DM Sans', sans-serif",
                            cursor: "pointer", transition: "all 0.15s ease",
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(5,150,105,0.14)";
                            e.currentTarget.style.borderColor = T.green;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(5,150,105,0.07)";
                            e.currentTarget.style.borderColor = "rgba(5,150,105,0.2)";
                          }}
                        >
                          <span style={{ fontSize: 11 }}>✓</span>
                          {row.Valid.toLocaleString()} Valid
                        </button>
                      </td>

                      {/* Invalid Records button */}
                      <td style={{
                        padding: "14px 20px", textAlign: "center",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                      }}>
                        {row.Invalid > 0 ? (
                          <button
                            onClick={() => handleViewInvalid(row.name)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "6px 14px", borderRadius: 8,
                              border: "1px solid rgba(204,0,0,0.22)",
                              background: "rgba(204,0,0,0.06)",
                              color: T.red, fontWeight: 700, fontSize: 13,
                              fontFamily: "'DM Sans', sans-serif",
                              cursor: "pointer", transition: "all 0.15s ease",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(204,0,0,0.12)";
                              e.currentTarget.style.borderColor = T.red;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(204,0,0,0.06)";
                              e.currentTarget.style.borderColor = "rgba(204,0,0,0.22)";
                            }}
                          >
                            <span style={{ fontSize: 11 }}>✕</span>
                            {row.Invalid.toLocaleString()} Invalid
                          </button>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 14px", borderRadius: 8,
                            background: "#F4F4F4",
                            border: "1px solid #E5E5E5",
                            color: "#A1A1AA", fontWeight: 600, fontSize: 13,
                            whiteSpace: "nowrap",
                          }}>
                            <span style={{ fontSize: 11 }}>✕</span>
                            0 Invalid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per-user breakdown table ── */}
      {userData.length > 0 && (
        <div style={{
          background: T.white, borderRadius: 14,
          border: `1px solid ${T.border}`,
          overflow: "hidden",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: T.purpleBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 2,
            }}>
              <User size={16} color={T.purple} />
            </div>

            {/* Title + legend */}
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.3px" }}>
                Per-User Validation Summary
              </h3>
              <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2, marginBottom: 10 }}>
                {userData.length} user(s) tracked
                {userSearch && ` — showing ${userData.filter(u => (u.username || "").toLowerCase().includes(userSearch.toLowerCase())).length} result(s)`}
              </p>
              {/* Accuracy legend */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { dot: T.green,   label: "70%+ accuracy",   bg: "rgba(5,150,105,0.07)",  border: "rgba(5,150,105,0.18)" },
                  { dot: "#D97706", label: "40–69% accuracy",  bg: "rgba(217,119,6,0.07)",  border: "rgba(217,119,6,0.18)" },
                  { dot: T.red,     label: "Below 40%",        bg: "rgba(204,0,0,0.06)",    border: "rgba(204,0,0,0.16)" },
                ].map(({ dot, label, bg, border }) => (
                  <span key={label} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "3px 10px", borderRadius: 99,
                    background: bg, border: `1px solid ${border}`,
                    fontSize: 11.5, fontWeight: 600, color: dot,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 9, padding: "7px 12px",
              flexShrink: 0, width: 220, marginTop: 2,
              transition: "border-color 0.15s",
            }}
              onFocusCapture={(e) => { e.currentTarget.style.borderColor = T.purple; }}
              onBlurCapture={(e)  => { e.currentTarget.style.borderColor = T.border; }}
            >
              <Search size={13} color={T.muted} style={{ flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search user…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  border: "none", outline: "none", background: "transparent",
                  fontSize: 13, color: T.text, width: "100%",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {userSearch && (
                <button
                  onClick={() => setUserSearch("")}
                  style={{
                    border: "none", background: "none", cursor: "pointer",
                    padding: 0, display: "flex", alignItems: "center", color: T.muted,
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: T.pageBg }}>
                  {[
                    { label: "User",           align: "left"   },
                    { label: "Total Rows",     align: "center" },
                    { label: "Valid",          align: "center" },
                    { label: "Invalid",        align: "center" },
                    { label: "Accuracy",       align: "left"   },
                    { label: "Form Breakdown", align: "left"   },
                  ].map(({ label, align }) => (
                    <th key={label} style={{
                      padding: "10px 16px",
                      textAlign: align,
                      fontSize: 11, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.6px",
                      color: T.muted, whiteSpace: "nowrap",
                      borderBottom: `1px solid ${T.border}`,
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userData
                  .filter((u) => !userSearch || (u.username || "").toLowerCase().includes(userSearch.toLowerCase()))
                  .map((user, i) => (
<UserRow
                      key={user.username || i}
                      user={user}
                      index={i}
                      onViewRecords={handleViewUserRecords}
                    />
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      </>)}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Dashboard;
