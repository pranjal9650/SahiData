import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  MapPin, CheckCircle2, AlertTriangle, Layers,
  Search, X, RefreshCw, Zap, Battery, Activity, Radio,
  Globe, ChevronDown, Clock,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

import API_BASE from "./config";
const BASE_URL = API_BASE;

const T = {
  red:     "#CC0000",
  redDark: "#A30000",
  black:   "#111111",
  grey200: "#E4E4E7",
  grey100: "#F4F4F5",
  white:   "#FFFFFF",
  green:   "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  redBg:   "rgba(204,0,0,0.07)",
  blue:    "#2563EB",
  blueBg:  "rgba(37,99,235,0.07)",
  amber:   "#d97706",
  amberBg: "rgba(245,158,11,0.08)",
  purple:  "#7C3AED",
  purpleBg:"rgba(124,58,237,0.07)",
  text:    "#111111",
  muted:   "#71717A",
};

const BAR_COLORS = [
  "#ef4444", "#f59e0b", "#3b82f6",
  "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const PIE_COLORS = [
  "#ef4444", "#f59e0b", "#3b82f6", "#10b981",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#0ea5e9",
];

const CRITICAL_KEYWORDS = ["BTLV", "L LVD CUT", "MNSF"];
function isCritical(alarmName) {
  const n = (alarmName || "").toUpperCase();
  return CRITICAL_KEYWORDS.some(k => n.includes(k));
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtVolt(volt) {
  if (volt === null || volt === undefined || volt === 0 || volt === 0.0) return "—";
  return `${parseFloat(volt).toFixed(1)}V`;
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes < 0) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `about ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function activeFor(start_time) {
  if (!start_time) return "—";
  const t = new Date(start_time);
  if (isNaN(t)) return "—";
  const diff = Date.now() - t.getTime();
  if (diff < 0) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function buildHourlyTrend(alarms) {
  const now = new Date();
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now.getTime() - (23 - i) * 3600000);
    return { label: `${String(h.getHours()).padStart(2, "0")}:00`, count: 0 };
  });
  alarms.forEach(a => {
    if (!a.start_time) return;
    const t = new Date(a.start_time);
    if (isNaN(t)) return;
    const diffHrs = (now - t) / 3600000;
    if (diffHrs >= 0 && diffHrs < 24) {
      const idx = 23 - Math.floor(diffHrs);
      if (idx >= 0 && idx < 24) buckets[idx].count++;
    }
  });
  return buckets;
}

// ── Status Badge ──────────────────────────────────────────────────────

const STATUS_CFG = {
  Critical: { color: T.red,    bg: T.redBg,    icon: "⊗" },
  Warning:  { color: T.amber,  bg: T.amberBg,  icon: "△" },
  Alarm:    { color: T.purple, bg: T.purpleBg, icon: "◎" },
  Healthy:  { color: T.green,  bg: T.greenBg,  icon: "⊙" },
  Unknown:  { color: T.muted,  bg: T.grey100,  icon: "○" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.Unknown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {cfg.icon} {status}
    </span>
  );
}

// ── Alarm badge in Alarms tab ─────────────────────────────────────────

const ALARM_BADGE_COLORS = [
  "#ef4444","#f59e0b","#3b82f6","#10b981","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#0ea5e9"
];
const _alarmColorCache = {};
let _alarmColorIdx = 0;
function alarmBadgeColor(name) {
  if (!_alarmColorCache[name]) {
    _alarmColorCache[name] = ALARM_BADGE_COLORS[_alarmColorIdx++ % ALARM_BADGE_COLORS.length];
  }
  return _alarmColorCache[name];
}

// ── Analytics KPI Card ────────────────────────────────────────────────

function AnalyticsKpi({ label, value, color, border }) {
  return (
    <div style={{
      background: T.white, borderRadius: 12,
      border: `1px solid ${T.grey200}`,
      borderLeft: `4px solid ${border}`,
      padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: -1.5, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Inline loading spinner ────────────────────────────────────────────

function TabLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 12 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "_spin 0.9s linear infinite" }} />
      <span style={{ color: T.muted, fontSize: 13 }}>Loading…</span>
    </div>
  );
}

// ── Date formatter for chart axis ─────────────────────────────────────

function fmtAxisDate(v) {
  const d = new Date(v);
  return isNaN(d) ? v : `${d.toLocaleString("en-IN", { month: "short" })} ${d.getDate()}`;
}

// Converts "YYYY-MM-DD HH:00" → "May 7, 05:00"
function fmtTimelineLabel(label) {
  if (!label || label.length < 16) return label;
  try {
    const datePart = label.substring(0, 10);
    const timePart = label.substring(11);
    const d = new Date(datePart + "T00:00:00");
    return `${d.toLocaleString("en-IN", { month: "short" })} ${d.getDate()}, ${timePart}`;
  } catch { return label; }
}

// ── Custom Tooltips ───────────────────────────────────────────────────

function ActiveResolvedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const resolved = payload.find(p => p.dataKey === "resolved");
  const act      = payload.find(p => p.dataKey === "active");
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <p style={{ margin: "0 0 5px", fontWeight: 700, color: "#111" }}>{fmtAxisDate(label)}</p>
      {act      && <p style={{ margin: "2px 0", color: "#CC0000", fontWeight: 600 }}>Active : {act.value}</p>}
      {resolved && <p style={{ margin: "2px 0", color: "#059669", fontWeight: 600 }}>Resolved : {resolved.value}</p>}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8,
      padding: "10px 16px", fontSize: 14, fontWeight: 700, color: "#111",
      fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      {name} : {value}
    </div>
  );
}

function AlarmTimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <p style={{ margin: "0 0 5px", fontWeight: 700, color: "#111" }}>{fmtTimelineLabel(label)}</p>
      <p style={{ margin: 0, color: "#CC0000", fontWeight: 700 }}>Alarms : {payload[0]?.value}</p>
    </div>
  );
}

// ── Site Detail Modal ─────────────────────────────────────────────────

function SiteDetailModal({ imei, siteName, globalId, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!imei) { setLoading(false); return; }
    setLoading(true);
    axios.get(`${BASE_URL}/SITE-DETAIL?imei=${encodeURIComponent(imei)}&days=7`)
      .then(r => setDetail(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [imei]);

  const maxDowntimeHours = detail?.downtime_by_reason?.[0]?.hours || 1;

  const statBox = (value, label, color = T.text) => (
    <div style={{ background: T.grey100, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 3 }}>{label}</div>
    </div>
  );

  const LBadge = () => (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 26, height: 26, borderRadius: "50%",
      background: "#374151", color: T.white,
      fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>L</span>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.white, borderRadius: 16,
        width: "100%", maxWidth: 800,
        maxHeight: "90vh",
        boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── Sticky header ── */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${T.grey200}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          position: "sticky", top: 0, background: T.white, zIndex: 2,
          borderRadius: "16px 16px 0 0", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: T.redBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Radio size={18} color={T.red} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.black, letterSpacing: -0.3 }}>{siteName}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                {globalId} &nbsp;|&nbsp; IMEI: {imei}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: T.white, border: `1.5px solid ${T.red}`,
            borderRadius: 8, width: 32, height: 32,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <X size={15} color={T.red} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "_spin 0.9s linear infinite" }} />
              <span style={{ color: T.muted, fontSize: 13 }}>Loading site data…</span>
            </div>
          ) : !detail ? (
            <div style={{ padding: 40, textAlign: "center", color: T.muted }}>No data available</div>
          ) : (
            <>
              {/* ── Top alarms card section (always shown) ── */}
              {(() => {
                const hasActive = detail.active_alarms.length > 0;
                const displayAlarms = hasActive
                  ? detail.active_alarms
                  : (detail.alarm_history || []).slice(0, 5);
                const borderColor = hasActive ? "rgba(204,0,0,0.2)" : T.grey200;
                const bgColor     = hasActive ? "rgba(204,0,0,0.02)" : T.grey100;
                const dotColor    = hasActive ? T.red : T.green;
                const headerColor = hasActive ? T.red : T.muted;
                const headerText  = hasActive
                  ? `${detail.active_alarms.length} Active Alarm${detail.active_alarms.length > 1 ? "s" : ""}`
                  : displayAlarms.length > 0
                    ? `Recent Alarms (Last 7 Days)`
                    : `No Alarms in Last 7 Days`;

                return (
                  <div style={{ border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: "14px 16px", background: bgColor }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: displayAlarms.length > 0 ? 12 : 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: headerColor }}>{headerText}</span>
                    </div>
                    {displayAlarms.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {displayAlarms.map((a, i) => {
                          const badgeCol = alarmBadgeColor(a.alarm_name);
                          const isActive = hasActive ? true : a.is_active;
                          return (
                            <div key={i} style={{
                              background: isActive ? "rgba(204,0,0,0.025)" : T.white,
                              borderRadius: 10,
                              border: `1px solid ${isActive ? "rgba(204,0,0,0.1)" : T.grey200}`,
                              padding: "10px 14px 8px",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: badgeCol, background: `${badgeCol}20`, border: `1px solid ${badgeCol}35`, padding: "4px 12px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 }}>
                                  {a.alarm_name}
                                </span>
                                <span style={{ fontSize: 13, color: "#555", flex: 1 }}>{fmtDateShort(a.start_time)}</span>
                                {!hasActive && (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? T.red : T.green, background: isActive ? T.redBg : T.greenBg, padding: "2px 9px", borderRadius: 99, border: `1px solid ${isActive ? "rgba(204,0,0,0.2)" : "rgba(5,150,105,0.2)"}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                                    {isActive ? "Active" : "Resolved"}
                                  </span>
                                )}
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, background: T.white, padding: "4px 12px", borderRadius: 99, border: `1px solid ${T.grey200}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                                  {fmtDuration(a.duration_min)}
                                </span>
                              </div>
                              <div style={{ marginTop: 8 }}><LBadge /></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Stats row 1 ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {statBox(`${detail.uptime_pct}%`, "Uptime (7d)", detail.uptime_pct > 80 ? T.green : T.red)}
                {statBox(`${detail.active_count} active / ${detail.resolved_count} resolved`, "Total Alarms", T.text)}
                {statBox(`${detail.total_downtime_hours}h`, "Total Downtime", T.amber)}
                {statBox(detail.mttr_minutes < 60 ? `${detail.mttr_minutes}m` : `${Math.floor(detail.mttr_minutes/60)}h ${detail.mttr_minutes%60}m`, "MTTR (Avg Resolve)", T.blue)}
              </div>

              {/* ── Stats row 2 ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {statBox(fmtDuration(detail.longest_outage_min),  "Longest Outage")}
                {statBox(fmtDuration(detail.shortest_outage_min), "Shortest Outage")}
                {statBox(detail.alarm_types_count, "Alarm Types")}
              </div>

              {/* ── Downtime by reason ── */}
              {detail.downtime_by_reason.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Downtime by Reason (Hours)</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.downtime_by_reason.map((r, i) => {
                      const pct = Math.round((r.hours / maxDowntimeHours) * 100);
                      const col = i === 0 ? T.red : i === 1 ? T.amber : T.blue;
                      return (
                        <div key={r.alarm_name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 120, fontSize: 12.5, fontWeight: 600, color: T.text, flexShrink: 0 }}>{r.alarm_name}</span>
                          <div style={{ flex: 1, height: 10, borderRadius: 99, background: T.grey200, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, flexShrink: 0, minWidth: 80, textAlign: "right" }}>
                            {r.hours}h ({r.count})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Charts row ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Daily Trend</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={detail.daily_trend} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.muted }}
                        tickFormatter={v => { const d = new Date(v); return `${d.toLocaleString("en-IN",{month:"short"})} ${d.getDate()}`; }} />
                      <YAxis tick={{ fontSize: 9, fill: T.muted }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", borderRadius: 8, border: `1px solid ${T.grey200}` }}
                        labelFormatter={v => { const d = new Date(v); return `${d.toLocaleString("en-IN",{month:"short"})} ${d.getDate()}`; }}
                        formatter={v => [v, "Alarms"]} />
                      <Bar dataKey="count" fill={T.red} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Voltage History</p>
                  {detail.voltage_history.length === 0 ? (
                    <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>No voltage data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={detail.voltage_history} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="voltGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={T.amber} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={T.amber} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                        <XAxis dataKey="time" tick={false} />
                        <YAxis tick={{ fontSize: 9, fill: T.muted }} domain={["auto","auto"]} />
                        <Tooltip contentStyle={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", borderRadius: 8, border: `1px solid ${T.grey200}` }}
                          formatter={v => [`${v}V`, "Voltage"]} labelFormatter={() => ""} />
                        <Area type="monotone" dataKey="volt" stroke={T.amber} strokeWidth={2} fill="url(#voltGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Alarm History table ── */}
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Alarm History</p>
                <div style={{ border: `1px solid ${T.grey200}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          {["Start", "Alarm", "Status", "Duration", "Escalation", "Volt"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: T.muted, background: T.grey100, borderBottom: `1px solid ${T.grey200}`, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.alarm_history.slice(0, 50).map((a, i) => (
                          <tr key={i} style={{ background: a.is_active ? "rgba(204,0,0,0.02)" : T.white }}
                            onMouseEnter={e => e.currentTarget.style.background = T.grey100}
                            onMouseLeave={e => e.currentTarget.style.background = a.is_active ? "rgba(204,0,0,0.02)" : T.white}
                          >
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}`, color: T.muted, whiteSpace: "nowrap" }}>{fmtDateShort(a.start_time)}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}` }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, background: T.grey100, border: `1px solid ${T.grey200}`, padding: "2px 10px", borderRadius: 99 }}>
                                {a.alarm_name}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}` }}>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: a.is_active ? T.red : T.green, background: a.is_active ? T.redBg : T.greenBg, padding: "2px 10px", borderRadius: 99, border: `1px solid ${a.is_active ? "rgba(204,0,0,0.2)" : "rgba(5,150,105,0.2)"}` }}>
                                {a.is_active ? "Active" : "Resolved"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}`, color: T.muted }}>{fmtDuration(a.duration_min)}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}` }}>
                              {a.duration_min >= 5
                                ? <LBadge />
                                : <span style={{ color: T.muted }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${T.grey200}`, color: T.muted }}>{fmtVolt(a.volt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon, bg, progress }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.white, borderRadius: 12, border: `1px solid ${T.grey200}`,
        padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8,
        position: "relative", overflow: "hidden",
        boxShadow: hovered ? "0 6px 20px rgba(0,0,0,0.09)" : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "all 0.18s ease", cursor: "default",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: accent, borderRadius: "12px 0 0 12px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={accent} />
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: -1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.red, fontWeight: 600 }}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ height: 4, borderRadius: 99, background: T.grey200, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(progress, 100)}%`, background: progress > 80 ? T.green : progress > 50 ? T.amber : T.red, borderRadius: 99, transition: "width 0.6s ease" }} />
        </div>
      )}
    </div>
  );
}

// ── Feed filter pill ──────────────────────────────────────────────────

function FeedFilter({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 18px", borderRadius: 20, border: "none",
      background: active ? color : T.grey100, color: active ? T.white : T.muted,
      fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
      cursor: "pointer", transition: "all 0.15s",
    }}>
      {children}
    </button>
  );
}

// ── Tab button ────────────────────────────────────────────────────────

function Tab({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 18px", border: "none", background: "none",
      fontSize: 13.5, fontWeight: 600,
      color: active ? T.text : T.muted,
      borderBottom: active ? `2px solid ${T.red}` : "2px solid transparent",
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      transition: "color 0.15s", whiteSpace: "nowrap",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

// ── Dropdown ──────────────────────────────────────────────────────────

function Dropdown({ value, onChange, options, placeholder = "All" }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none",
          paddingLeft: 12, paddingRight: 32, height: 34,
          borderRadius: 8, border: `1px solid ${T.grey200}`,
          background: T.white, fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
          color: T.text, outline: "none", cursor: "pointer",
          fontWeight: 500, minWidth: 130,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = T.red; }}
        onBlur={e => { e.currentTarget.style.borderColor = T.grey200; }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={13} color={T.muted} style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
    </div>
  );
}

// ── Search Input ──────────────────────────────────────────────────────

function SearchBox({ value, onChange, placeholder = "Search…", width = 220 }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: T.white,
      border: `1px solid ${focused ? T.red : T.grey200}`,
      borderRadius: 8, padding: "0 12px",
      height: 34, width, transition: "border-color 0.15s",
      boxShadow: focused ? "0 0 0 3px rgba(204,0,0,0.08)" : "none",
    }}>
      <Search size={12} color={T.muted} style={{ flexShrink: 0 }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text }}
      />
      {value && <X size={11} color={T.muted} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => onChange("")} />}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

const SiteMonitoring = () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [selectedDate,  setSelectedDate]  = useState(todayISO);
  const [refreshing,    setRefreshing]    = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState(null);

  const [summary,      setSummary]      = useState(null);
  const [alarms,       setAlarms]       = useState([]);
  const [siteList,     setSiteList]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState("feed");

  // Feed tab filters
  const [feedFilter,    setFeedFilter]    = useState("active");
  const [feedSearch,    setFeedSearch]    = useState("");
  const [feedFocused,   setFeedFocused]   = useState(false);
  const [selectedSite,  setSelectedSite]  = useState(null);

  // Alarms tab filters
  const [alarmTypeF,    setAlarmTypeF]    = useState("");
  const [alarmStateF,   setAlarmStateF]   = useState("");

  // Sites tab filters
  const [siteSearch,    setSiteSearch]    = useState("");
  const [siteCircleF,   setSiteCircleF]   = useState("");
  const [siteStatusF,   setSiteStatusF]   = useState("");
  const [unmappedOnly,  setUnmappedOnly]  = useState(false);

  // Reports tab
  const [reportData,       setReportData]       = useState(null);
  const [reportRange,      setReportRange]       = useState("today");
  const [reportLoading,    setReportLoading]     = useState(false);
  const [expandedCircles,  setExpandedCircles]   = useState(new Set());

  // Analytics tab
  const [analyticsData,    setAnalyticsData]    = useState(null);
  const [analyticsRange,   setAnalyticsRange]   = useState("24h");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => { fetchAll(); }, [selectedDate]); // eslint-disable-line

  const fetchAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/SITE-MONITORING-ALL?date=${selectedDate}`);
      const d = res.data;
      setSummary(d.summary || null);
      setAlarms(d.alarms || []);
      setSiteList(d.site_list || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchReports = async (range) => {
    setReportLoading(true);
    setReportData(null);
    try {
      const r = await axios.get(`${BASE_URL}/CIRCLE-REPORT?range=${range}`);
      setReportData(r.data);
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  };

  const fetchAnalytics = async (range) => {
    setAnalyticsLoading(true);
    setAnalyticsData(null);
    try {
      const r = await axios.get(`${BASE_URL}/ANALYTICS-DATA?range=${range}`);
      setAnalyticsData(r.data);
    } catch (e) { console.error(e); }
    finally { setAnalyticsLoading(false); }
  };

  useEffect(() => {
    if (tab === "reports"   && !reportData    && !reportLoading)    fetchReports(reportRange);
    if (tab === "analytics" && !analyticsData && !analyticsLoading) fetchAnalytics(analyticsRange);
  }, [tab]); // eslint-disable-line

  const handleReportRange = (r) => { setReportRange(r); fetchReports(r); };
  const handleAnalyticsRange = (r) => { setAnalyticsRange(r); fetchAnalytics(r); };

  // ── Feed derived ──
  const activeAlarms   = useMemo(() => alarms.filter(a => a.is_active),  [alarms]);
  const resolvedAlarms = useMemo(() => alarms.filter(a => !a.is_active), [alarms]);

  const feedAlarms = useMemo(() => {
    let base = feedFilter === "active"   ? activeAlarms
             : feedFilter === "resolved" ? resolvedAlarms
             : alarms;
    if (feedSearch) {
      const q = feedSearch.toLowerCase();
      base = base.filter(a =>
        a.site_name?.toLowerCase().includes(q) ||
        a.global_id?.toLowerCase().includes(q) ||
        a.alarm_name?.toLowerCase().includes(q)
      );
    }
    return base;
  }, [alarms, activeAlarms, resolvedAlarms, feedFilter, feedSearch]);

  const topAlarmTypes = useMemo(() => {
    const counts = {};
    alarms.forEach(a => { const n = a.alarm_name || "Unknown"; counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([name,count]) => ({name,count}));
  }, [alarms]);

  const maxAlarmCount = topAlarmTypes[0]?.count || 1;
  const trendData     = useMemo(() => buildHourlyTrend(alarms), [alarms]);

  // ── Alarms tab derived ──
  const alarmTypeOptions  = useMemo(() => [...new Set(alarms.map(a => a.alarm_name).filter(Boolean))].sort(), [alarms]);
  const alarmStateOptions = useMemo(() => [...new Set(alarms.map(a => a.state_name).filter(Boolean))].sort(), [alarms]);

  const filteredAlarms = useMemo(() => {
    return alarms.filter(a => {
      if (alarmTypeF  && a.alarm_name !== alarmTypeF) return false;
      if (alarmStateF && !(a.state_name || "").toLowerCase().includes(alarmStateF.toLowerCase())) return false;
      return true;
    });
  }, [alarms, alarmTypeF, alarmStateF]);

  // ── Sites tab derived ──
  const imeiStatusMap = useMemo(() => {
    const map = {};
    // Sort active alarms first so they overwrite resolved entries
    const sorted = [...alarms].sort((a,b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));
    sorted.forEach(a => {
      const imei = a.imei;
      if (!imei) return;
      if (!map[imei] || a.is_active) {
        const status = a.is_active
          ? (isCritical(a.alarm_name) ? "Critical" : "Warning")
          : "Alarm";
        map[imei] = { status, lastAlarm: a.start_time, alarmName: a.alarm_name, stateName: a.state_name };
      }
    });
    return map;
  }, [alarms]);

  const circleOptions = useMemo(() => {
    const circles = new Set();
    siteList.forEach(s => { if (s.circle && s.circle !== "—") circles.add(s.circle); });
    alarms.forEach(a => { if (a.state_name) circles.add(a.state_name); });
    return [...circles].sort();
  }, [siteList, alarms]);

  const enrichedSites = useMemo(() => {
    return siteList.map(s => {
      const imei = s.imei_no && s.imei_no !== "—" ? s.imei_no : null;
      const alarmInfo = imei ? imeiStatusMap[imei] : null;
      const circle = s.circle && s.circle !== "—" ? s.circle : (alarmInfo?.stateName || null);
      return {
        ...s,
        circle,
        status: alarmInfo ? alarmInfo.status : "Healthy",
        lastAlarm: alarmInfo?.lastAlarm || null,
        imei,
      };
    });
  }, [siteList, imeiStatusMap]);

  const filteredSites = useMemo(() => {
    return enrichedSites.filter(s => {
      const q = siteSearch.toLowerCase();
      if (q && !(s.site_name||"").toLowerCase().includes(q) &&
               !(s.site_id||"").toLowerCase().includes(q) &&
               !(s.imei_no||"").toLowerCase().includes(q)) return false;
      if (siteCircleF && s.circle !== siteCircleF) return false;
      if (siteStatusF && s.status !== siteStatusF) return false;
      if (unmappedOnly && s.circle) return false;
      return true;
    });
  }, [enrichedSites, siteSearch, siteCircleF, siteStatusF, unmappedOnly]);

  // ── Loading ──
  if (loading || !summary) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "_spin 0.9s linear infinite" }} />
        <p style={{ color: T.muted, fontSize: 14, margin: 0, fontWeight: 500 }}>Loading site monitoring…</p>
      </div>
    );
  }

  const thStyle = { padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: T.muted, borderBottom: `1px solid ${T.grey200}`, background: T.grey100, whiteSpace: "nowrap" };
  const tdStyle = { padding: "11px 16px", borderBottom: `1px solid ${T.grey200}`, fontSize: 13, color: T.text };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>

      {selectedSite && (
        <SiteDetailModal
          imei={selectedSite.imei}
          siteName={selectedSite.site_name}
          globalId={selectedSite.global_id}
          onClose={() => setSelectedSite(null)}
        />
      )}

      {/* ── Header bar ── */}
      <div style={{
        background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`,
        padding: "16px 22px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>
            Site Monitoring
          </h2>
          <p style={{ fontSize: 12, color: T.muted, margin: "3px 0 0", fontWeight: 500 }}>
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()} · Showing: ${selectedDate}`
              : `Showing: ${selectedDate}`}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Date pill label */}
          <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>Date</span>

          {/* Date picker */}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input
              type="date"
              value={selectedDate}
              max={todayISO}
              onChange={e => {
                setSelectedDate(e.target.value);
                setTab("feed");
              }}
              style={{
                height: 36, padding: "0 36px 0 12px",
                borderRadius: 9, border: `1.5px solid ${T.grey200}`,
                background: T.white, fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                color: T.text, outline: "none", cursor: "pointer",
                fontWeight: 500, transition: "border-color 0.15s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.08)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = T.grey200; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Today shortcut */}
          {selectedDate !== todayISO && (
            <button
              onClick={() => setSelectedDate(todayISO)}
              style={{
                height: 36, padding: "0 14px", borderRadius: 9,
                border: `1.5px solid ${T.grey200}`,
                background: T.white, color: T.muted,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.grey200; e.currentTarget.style.color = T.muted; }}
            >
              Today
            </button>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: T.grey200 }} />

          {/* Refresh */}
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 36, padding: "0 16px", borderRadius: 9,
              border: `1.5px solid ${T.grey200}`,
              background: refreshing ? T.grey100 : T.white,
              color: refreshing ? T.muted : T.text,
              fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: refreshing ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.grey200; e.currentTarget.style.color = refreshing ? T.muted : T.text; }}
          >
            {refreshing ? (
              <>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${T.grey200}`, borderTop: `2px solid ${T.red}`, animation: "_spin 0.75s linear infinite" }} />
                Refreshing…
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                Refresh
              </>
            )}
          </button>

          {/* Historical badge */}
          {selectedDate !== todayISO && (
            <span style={{
              fontSize: 11.5, fontWeight: 700, padding: "4px 10px",
              borderRadius: 99, background: "rgba(217,119,6,0.1)",
              color: T.amber, border: "1px solid rgba(217,119,6,0.2)",
            }}>
              Historical
            </span>
          )}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KpiCard label="Total Sites"  value={summary.total_sites}  icon={Layers}        accent={T.blue}  bg={T.blueBg} />
        <KpiCard label="Sites Down"   value={summary.down_sites}   icon={AlertTriangle} accent={T.red}   bg={T.redBg}   sub={summary.total_alarms ? `${summary.total_alarms} alarms` : null} />
        <KpiCard label="Mains Failed" value={summary.mains_failed} icon={Zap}           accent={T.amber} bg={T.amberBg} />
        <KpiCard label="Battery Low"  value={summary.battery_low}  icon={Battery}       accent={T.amber} bg={T.amberBg} />
        <KpiCard label="Healthy"      value={`${summary.healthy_pct}%`} icon={Activity} accent={T.green} bg={T.greenBg} progress={summary.healthy_pct} />
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.grey200}`, padding: "0 20px", overflowX: "auto" }}>
          <div style={{ display: "flex" }}>
            <Tab active={tab === "feed"}      onClick={() => setTab("feed")}      icon={Activity}>Feed</Tab>
            <Tab active={tab === "alarms"}    onClick={() => setTab("alarms")}    icon={AlertTriangle}>Alarms</Tab>
            <Tab active={tab === "sites"}     onClick={() => setTab("sites")}     icon={MapPin}>Sites</Tab>
            <Tab active={tab === "reports"}   onClick={() => setTab("reports")}   icon={Layers}>Reports</Tab>
            <Tab active={tab === "analytics"} onClick={() => setTab("analytics")} icon={Activity}>Analytics</Tab>
          </div>
          <button
            onClick={() => fetchAll(true)}
            style={{ background: "none", border: `1px solid ${T.grey200}`, borderRadius: 7, padding: "5px 12px", fontSize: 12, color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* ══ FEED TAB ══ */}
        {tab === "feed" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, borderBottom: `1px solid ${T.grey200}` }}>
              <div style={{ padding: "20px 24px", borderRight: `1px solid ${T.grey200}` }}>
                <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Alarm Trend (24H)</p>
                {alarms.length === 0 ? (
                  <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 13 }}>No alarm data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: T.muted }} interval={3} />
                      <YAxis tick={{ fontSize: 9.5, fill: T.muted }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", borderRadius: 8, border: `1px solid ${T.grey200}` }} labelStyle={{ fontWeight: 700, color: T.text }} formatter={(v) => [v, "Alarms"]} />
                      <Line type="monotone" dataKey="count" stroke={T.red} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: T.red }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Top Alarm Types</p>
                {topAlarmTypes.length === 0 ? (
                  <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 13 }}>No alarm data</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {topAlarmTypes.map(({ name, count }, i) => {
                      const pct = Math.round((count / maxAlarmCount) * 100);
                      const col = BAR_COLORS[i % BAR_COLORS.length];
                      return (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 110, fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{name}</span>
                          <div style={{ flex: 1, height: 9, borderRadius: 99, background: T.grey200, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99 }} />
                          </div>
                          <span style={{ width: 34, fontSize: 12, fontWeight: 700, color: T.muted, textAlign: "right", flexShrink: 0 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${T.grey200}`, flexWrap: "wrap" }}>
              <FeedFilter active={feedFilter === "active"}   color={T.red}   onClick={() => setFeedFilter("active")}>Active ({activeAlarms.length})</FeedFilter>
              <FeedFilter active={feedFilter === "resolved"} color={T.green} onClick={() => setFeedFilter("resolved")}>Resolved ({resolvedAlarms.length})</FeedFilter>
              <FeedFilter active={feedFilter === "all"}      color={T.blue}  onClick={() => setFeedFilter("all")}>All ({alarms.length})</FeedFilter>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: feedFocused ? T.white : T.grey100, border: `1px solid ${feedFocused ? T.red : T.grey200}`, borderRadius: 8, padding: "7px 12px", minWidth: 240, boxShadow: feedFocused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none", transition: "all 0.15s" }}>
                <Search size={12} color={T.muted} style={{ flexShrink: 0 }} />
                <input value={feedSearch} onChange={e => setFeedSearch(e.target.value)} onFocus={() => setFeedFocused(true)} onBlur={() => setFeedFocused(false)} placeholder="Search site or alarm…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text }} />
                {feedSearch && <X size={11} color={T.muted} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setFeedSearch("")} />}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Since", "Site", "Alarm", "State", "Volt", "Active For"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {feedAlarms.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "48px 20px" }}>
                      {alarms.length === 0 ? "No alarm data — restart backend then refresh" : "No alarms match the current filter"}
                    </td></tr>
                  ) : feedAlarms.map((a, i) => (
                    <tr key={i} style={{ background: T.white, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.grey100}
                      onMouseLeave={e => e.currentTarget.style.background = T.white}
                      onClick={() => a.imei && setSelectedSite({ imei: a.imei, site_name: a.site_name, global_id: a.global_id })}
                    >
                      <td style={{ ...tdStyle, color: T.muted, whiteSpace: "nowrap", fontSize: 12.5 }}>{fmtTime(a.start_time)}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.blue }}>{a.site_name || "—"}</div>
                        <div style={{ fontSize: 11.5, color: T.muted, fontFamily: "monospace", marginTop: 2 }}>{a.global_id}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: a.is_active ? T.redBg : T.greenBg, color: a.is_active ? T.red : T.green, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: a.is_active ? T.red : T.green, flexShrink: 0 }} />
                          {a.alarm_name}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>{a.state_name || "—"}</td>
                      <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>{fmtVolt(a.volt)}</td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, background: T.grey100, color: T.muted, fontSize: 12, fontWeight: 600 }}>
                          {a.is_active ? activeFor(a.start_time) : "Resolved"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ ALARMS TAB ══ */}
        {tab === "alarms" && (
          <div>
            {/* Filters bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${T.grey200}`, flexWrap: "wrap" }}>
              <Dropdown
                value={alarmTypeF}
                onChange={setAlarmTypeF}
                options={alarmTypeOptions}
                placeholder="All Types"
              />
              <SearchBox
                value={alarmStateF}
                onChange={setAlarmStateF}
                placeholder="Filter by state…"
                width={200}
              />
              <span style={{ marginLeft: "auto", fontSize: 13, color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                {filteredAlarms.length.toLocaleString()} alarms
              </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Time", "Site", "Alarm", "State", "District", "Voltage", "Status"].map(h => (
                      <th key={h} style={{ ...thStyle, position: "sticky", top: 0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAlarms.length === 0 ? (
                    <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "48px 20px" }}>No alarms match the current filter</td></tr>
                  ) : filteredAlarms.map((a, i) => {
                    const badgeColor = alarmBadgeColor(a.alarm_name);
                    return (
                      <tr key={i} style={{ background: T.white }}>
                        <td style={{ ...tdStyle, color: T.muted, whiteSpace: "nowrap", fontSize: 12.5 }}>
                          {fmtTime(a.start_time)}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.site_name || "—"}</div>
                          <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace", marginTop: 2 }}>{a.global_id}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700, color: T.white, background: badgeColor, whiteSpace: "nowrap" }}>
                            {a.alarm_name || "—"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: T.muted }}>{a.state_name || "—"}</td>
                        <td style={{ ...tdStyle, color: T.muted }}>{a.district || "—"}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtVolt(a.volt)}</td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700, color: a.is_active ? T.red : T.green, background: a.is_active ? T.redBg : T.greenBg, border: `1px solid ${a.is_active ? "rgba(204,0,0,0.2)" : "rgba(5,150,105,0.2)"}` }}>
                            {a.is_active ? "Active" : "Resolved"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ SITES TAB ══ */}
        {tab === "sites" && (
          <div>
            {/* Filters bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${T.grey200}`, flexWrap: "wrap" }}>
              <SearchBox value={siteSearch} onChange={setSiteSearch} placeholder="Search site name, IMEI, ID…" width={260} />
              <Dropdown value={siteCircleF} onChange={setSiteCircleF} options={circleOptions} placeholder="All Circles" />
              <Dropdown
                value={siteStatusF}
                onChange={setSiteStatusF}
                options={["Healthy", "Critical", "Warning", "Alarm", "Unknown"]}
                placeholder="All Status"
              />
              <button
                onClick={() => setUnmappedOnly(v => !v)}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 8,
                  border: `1px solid ${unmappedOnly ? T.red : T.grey200}`,
                  background: unmappedOnly ? T.redBg : T.white,
                  color: unmappedOnly ? T.red : T.muted,
                  fontSize: 13, fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                Unmapped Only
              </button>
              <span style={{ marginLeft: "auto", fontSize: 13, color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                {filteredSites.length.toLocaleString()} sites
              </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Global ID", "Site Name", "IMEI", "Region", "Status", "Circle"].map(h => (
                      <th key={h} style={{ ...thStyle, position: "sticky", top: 0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "48px 20px" }}>No sites match the current filter</td></tr>
                  ) : filteredSites.map((s, i) => (
                    <tr key={i} style={{ background: T.white, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.grey100}
                      onMouseLeave={e => e.currentTarget.style.background = T.white}
                      onClick={() => s.imei && setSelectedSite({ imei: s.imei, site_name: s.site_name, global_id: s.site_id })}
                    >
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>{s.site_id || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.site_name || "—"}
                        </div>
                        {s.lastAlarm && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                            <Clock size={10} color={T.muted} />
                            <span style={{ fontSize: 11, color: T.muted }}>Last alarm: {timeAgo(s.lastAlarm)}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: T.muted }}>{s.imei_no || "—"}</td>
                      <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>{s.h1 || "—"}</td>
                      <td style={tdStyle}><StatusBadge status={s.status} /></td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12.5, color: s.circle ? T.text : T.muted, fontWeight: s.circle ? 600 : 400 }}>
                          {s.circle || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ REPORTS TAB ══ */}
        {tab === "reports" && (
          <div style={{ padding: "20px 24px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Circle-Wise Uptime Report</span>
              <div style={{ display: "flex", gap: 8 }}>
                {[["today","Today"],["yesterday","Yesterday"],["7days","7 Days"],["30days","30 Days"]].map(([v,l]) => (
                  <button key={v} onClick={() => { setExpandedCircles(new Set()); handleReportRange(v); }} style={{
                    padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: reportRange === v ? T.red : T.grey100,
                    color:      reportRange === v ? T.white : T.muted,
                    fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s",
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {reportLoading ? <TabLoader /> : !reportData ? null : (() => {
              const toggleCircle = (circle) => setExpandedCircles(prev => {
                const next = new Set(prev);
                next.has(circle) ? next.delete(circle) : next.add(circle);
                return next;
              });

              const subTh = { padding: "8px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: T.muted, background: "#F8F8F8", borderBottom: `1px solid ${T.grey200}`, whiteSpace: "nowrap" };
              const subTd = { padding: "10px 14px", borderBottom: `1px solid ${T.grey200}`, fontSize: 12.5, color: T.text };

              return (
                <>
                  <div style={{ border: `1px solid ${T.grey200}`, borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Circle</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Total Sites</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Sites Down</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Outage Min</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Uptime %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((row, i) => {
                          const expanded = expandedCircles.has(row.circle);
                          return (
                            <React.Fragment key={i}>
                              {/* ── Circle summary row ── */}
                              <tr
                                onClick={() => row.down_sites?.length && toggleCircle(row.circle)}
                                style={{ background: expanded ? "#FFF8F8" : T.white, cursor: row.down_sites?.length ? "pointer" : "default", transition: "background 0.12s" }}
                                onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = T.grey100; }}
                                onMouseLeave={e => { e.currentTarget.style.background = expanded ? "#FFF8F8" : T.white; }}
                              >
                                <td style={tdStyle}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <ChevronDown size={13} color={row.down_sites?.length ? T.muted : "transparent"}
                                      style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                                    <span style={{ fontWeight: 700 }}>{row.circle}</span>
                                  </div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>{row.total_sites}</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: row.sites_down > 0 ? 700 : 400, color: row.sites_down > 0 ? T.red : T.text }}>
                                  {row.sites_down}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: row.outage_min > 0 ? T.amber : T.muted, fontWeight: 600 }}>
                                  {row.outage_min.toLocaleString()}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700,
                                  color: row.uptime_pct >= 99 ? T.green : row.uptime_pct >= 95 ? T.amber : T.red }}>
                                  {row.uptime_pct}%
                                </td>
                              </tr>

                              {/* ── Expanded sub-table ── */}
                              {expanded && row.down_sites?.length > 0 && (
                                <tr>
                                  <td colSpan={5} style={{ padding: 0, background: "#FFFAFA" }}>
                                    <div style={{ padding: "14px 20px 16px 40px", borderBottom: `1px solid ${T.grey200}` }}>
                                      <div style={{ color: T.red, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                                        Down Sites ({row.down_sites.length})
                                      </div>
                                      <div style={{ border: `1px solid ${T.grey200}`, borderRadius: 10, overflow: "hidden" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                          <thead>
                                            <tr>
                                              {["Site", "Cluster", "Down Time", "Restored", "Outage", "Uptime", "Alarm", "Status"].map(h => (
                                                <th key={h} style={subTh}>{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {row.down_sites.map((site, j) => (
                                              <tr key={j} style={{ background: T.white }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.grey100}
                                                onMouseLeave={e => e.currentTarget.style.background = T.white}
                                              >
                                                <td style={{ ...subTd, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                  {site.site_name}
                                                </td>
                                                <td style={{ ...subTd, color: T.muted }}>{site.cluster}</td>
                                                <td style={{ ...subTd, color: T.muted, whiteSpace: "nowrap" }}>{site.down_time}</td>
                                                <td style={{ ...subTd, color: site.restored === "Active" ? T.red : T.muted, fontWeight: site.restored === "Active" ? 600 : 400, whiteSpace: "nowrap" }}>
                                                  {site.restored}
                                                </td>
                                                <td style={{ ...subTd, color: T.red, fontWeight: 700, whiteSpace: "nowrap" }}>
                                                  {site.outage_min}m
                                                </td>
                                                <td style={{ ...subTd, color: site.uptime_pct >= 80 ? T.text : T.amber, whiteSpace: "nowrap" }}>
                                                  {site.uptime_pct}%
                                                </td>
                                                <td style={{ ...subTd, maxWidth: 260 }}>
                                                  <span style={{ fontSize: 11.5, color: T.text, background: T.grey100, padding: "2px 8px", borderRadius: 6, display: "inline-block" }}>
                                                    {site.alarm || "—"}
                                                  </span>
                                                </td>
                                                <td style={subTd}>
                                                  <span style={{
                                                    display: "inline-block", padding: "3px 10px", borderRadius: 99,
                                                    fontSize: 12, fontWeight: 700,
                                                    color:      site.status === "Active" ? T.red : T.green,
                                                    background: site.status === "Active" ? T.redBg : T.greenBg,
                                                    border:     `1px solid ${site.status === "Active" ? "rgba(204,0,0,0.2)" : "rgba(5,150,105,0.2)"}`,
                                                  }}>{site.status}</span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Total row */}
                        <tr style={{ background: T.grey100 }}>
                          <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{reportData.total.total_sites}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: T.red }}>{reportData.total.sites_down}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{reportData.total.outage_min.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11.5, color: T.muted, marginTop: 10 }}>
                    Generated: {reportData.generated_at}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ══ ANALYTICS TAB ══ */}
        {tab === "analytics" && (
          <div style={{ padding: "20px 24px" }}>
            {/* Range pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[["24h","24h"],["3d","3d"],["7d","7d"],["30d","30d"]].map(([v,l]) => (
                <button key={v} onClick={() => handleAnalyticsRange(v)} style={{
                  padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: analyticsRange === v ? T.red : T.grey100,
                  color:      analyticsRange === v ? T.white : T.muted,
                  fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}>{l}</button>
              ))}
            </div>

            {analyticsLoading ? <TabLoader /> : !analyticsData ? null : (() => {
              const ad = analyticsData;
              const ttStyle = { fontSize: 12, borderRadius: 8, border: `1px solid ${T.grey200}`, fontFamily: "'DM Sans',sans-serif" };
              return (
                <>
                  {/* ── KPI row ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                    <AnalyticsKpi label="Fleet Uptime"              value={`${ad.fleet_uptime}%`} color={T.green} border={T.green} />
                    <AnalyticsKpi label="MTTR"                      value={`${ad.mttr_min}m`}     color={T.blue}  border={T.blue}  />
                    <AnalyticsKpi label="Sites Down"                value={ad.sites_down}          color={T.red}   border={T.red}   />
                    <AnalyticsKpi label={`Total (${analyticsRange})`} value={ad.total_alarms}      color={T.amber} border={T.amber} />
                  </div>

                  {/* ── Row 1: Downtime by Reason + Alarms by State ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div style={{ background: T.white, border: `1px solid ${T.grey200}`, borderRadius: 12, padding: "16px 20px" }}>
                      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Downtime by Reason (Hours)</p>
                      <ResponsiveContainer width="100%" height={Math.max(180, ad.downtime_by_reason.length * 28)}>
                        <BarChart data={ad.downtime_by_reason} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: T.muted }} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: T.text }} />
                          <Tooltip contentStyle={ttStyle} formatter={v => [`${v}h`, "Downtime"]} />
                          <Bar dataKey="hours" fill={T.red} radius={[0,4,4,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ background: T.white, border: `1px solid ${T.grey200}`, borderRadius: 12, padding: "16px 20px" }}>
                      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Alarms by State</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={ad.alarms_by_state.slice(0, 9)} dataKey="count" nameKey="name"
                            cx="50%" cy="50%" outerRadius={80}
                            label={({ name, pct }) => `${name} ${pct}%`}
                            labelLine
                          >
                            {ad.alarms_by_state.slice(0, 9).map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Row 2: Resolve Trend + Active vs Resolved ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div style={{ background: T.white, border: `1px solid ${T.grey200}`, borderRadius: 12, padding: "16px 20px" }}>
                      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Avg Resolve Time Trend (min)</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={ad.resolve_trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                          <defs>
                            <linearGradient id="resolveGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={T.blue} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={T.blue} stopOpacity={0}   />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: T.muted }} tickFormatter={fmtAxisDate} />
                          <YAxis tick={{ fontSize: 9.5, fill: T.muted }} />
                          <Tooltip contentStyle={ttStyle} labelFormatter={fmtAxisDate} formatter={v => [`${v} min`, "Avg MTTR"]} />
                          <Area type="monotone" dataKey="avg_min" stroke={T.blue} strokeWidth={2} fill="url(#resolveGrad)" dot={{ r: 3, fill: T.blue }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ background: T.white, border: `1px solid ${T.grey200}`, borderRadius: 12, padding: "16px 20px" }}>
                      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Active vs Resolved (Daily)</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={ad.active_vs_resolved} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: T.muted }} tickFormatter={fmtAxisDate} />
                          <YAxis tick={{ fontSize: 9.5, fill: T.muted }} />
                          <Tooltip content={<ActiveResolvedTooltip />} />
                          <Bar dataKey="active"   stackId="a" fill={T.red}   name="active" />
                          <Bar dataKey="resolved" stackId="a" fill={T.green} name="resolved" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Alarm Timeline (full width) ── */}
                  <div style={{ background: T.white, border: `1px solid ${T.grey200}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                    <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Alarm Timeline</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={ad.alarm_timeline} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={T.red} stopOpacity={0.22} />
                            <stop offset="95%" stopColor={T.red} stopOpacity={0}    />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.grey200} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9.5, fill: T.muted }}
                          interval={2}
                          tickFormatter={v => v.substring(11)}
                        />
                        <YAxis tick={{ fontSize: 9.5, fill: T.muted }} allowDecimals={false} />
                        <Tooltip content={<AlarmTimelineTooltip />} />
                        <Area type="monotone" dataKey="count" stroke={T.red} strokeWidth={2.5} fill="url(#timelineGrad)" dot={false} activeDot={{ r: 5, fill: T.red, stroke: T.white, strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* ── Worst-Performing Sites ── */}
                  <div style={{ border: `1px solid ${T.grey200}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.grey200}`, background: T.grey100 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Worst-Performing Sites (by Downtime)</span>
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["#", "Site", "Global ID", "Downtime", "Alarms", "Uptime %"].map(h => (
                              <th key={h} style={{ ...thStyle, position: "sticky", top: 0 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ad.worst_sites.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "40px 20px" }}>No data</td></tr>
                          ) : ad.worst_sites.map((s, i) => (
                            <tr key={i}
                              style={{ background: T.white, cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.background = T.grey100}
                              onMouseLeave={e => e.currentTarget.style.background = T.white}
                              onClick={() => setSelectedSite({ imei: s.imei, site_name: s.site_name, global_id: s.global_id })}
                            >
                              <td style={{ ...tdStyle, color: T.muted, fontWeight: 700, width: 40 }}>{i + 1}</td>
                              <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 220, color: T.blue }}>{s.site_name}</td>
                              <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: T.muted }}>{s.global_id}</td>
                              <td style={{ ...tdStyle, color: T.red, fontWeight: 700 }}>{s.downtime_h}h</td>
                              <td style={{ ...tdStyle, color: T.muted }}>{s.alarm_count}</td>
                              <td style={{ ...tdStyle, fontWeight: 700,
                                color: s.uptime_pct >= 95 ? T.green : s.uptime_pct >= 80 ? T.amber : T.red }}>
                                {s.uptime_pct}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
};

export default SiteMonitoring;
