import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Wifi, WifiOff, AlertTriangle, Clock,
  Search, X, MapPin, Activity, Radio, Globe,
} from "lucide-react";

const BASE_URL = "http://127.0.0.1:8000";

const T = {
  red:      "#CC0000",
  border:   "#E5E2DC",
  surface:  "#F2F0EB",
  pageBg:   "#F7F5F0",
  white:    "#FFFFFF",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.09)",
  redBg:    "rgba(204,0,0,0.08)",
  orange:   "#D97706",
  orangeBg: "rgba(217,119,6,0.08)",
  purple:   "#7C3AED",
  purpleBg: "rgba(124,58,237,0.08)",
  blue:     "#2563EB",
  blueBg:   "rgba(37,99,235,0.08)",
  text:     "#111111",
  muted:    "#6B7280",
};

/* ─── Stat Card ──────────────────────────────────────────────── */
function SiteStatCard({ label, value, icon: Icon, accent, bg, sub }) {
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
        cursor: "default",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "14px 14px 0 0" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.7px" }}>
          {label}
        </span>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} color={accent} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: "-1px" }}>
        {value ?? "—"}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

/* ─── Custom Tooltip ─────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.white, border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.09)",
      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    }}>
      <p style={{ fontWeight: 700, color: T.text, marginBottom: 6, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.fill, fontWeight: 600, margin: "2px 0" }}>
          {p.name}: <span style={{ color: T.text }}>{(p.value ?? 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Section Card ───────────────────────────────────────────── */
function SectionCard({ title, subtitle, icon: Icon, accent = T.red, accentBg = T.redBg, badge, action, children }) {
  return (
    <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icon && (
            <div style={{ width: 32, height: 32, borderRadius: 8, background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={15} color={accent} />
            </div>
          )}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.2px" }}>{title}</h3>
            {subtitle && <p style={{ fontSize: 12, color: T.muted, margin: "2px 0 0" }}>{subtitle}</p>}
          </div>
          {badge !== undefined && (
            <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, background: T.pageBg, border: `1px solid ${T.border}`, padding: "2px 8px", borderRadius: 99, marginLeft: 4 }}>
              {badge}
            </span>
          )}
        </div>
        {action && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

/* ─── Search Input ───────────────────────────────────────────── */
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          paddingLeft: 30, paddingRight: value ? 28 : 10,
          height: 34, borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: T.pageBg,
          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          color: T.text, outline: "none", width: 200,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.background = T.white; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.pageBg; }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
          <X size={11} color={T.muted} />
        </button>
      )}
    </div>
  );
}

/* ─── Filter Select ──────────────────────────────────────────── */
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 34, padding: "0 10px",
        borderRadius: 8, border: `1px solid ${T.border}`,
        background: T.pageBg, fontSize: 13,
        fontFamily: "'DM Sans', sans-serif",
        color: value === "All" ? T.muted : T.text,
        outline: "none", cursor: "pointer", minWidth: 140,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.red; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
    >
      <option value="All">{placeholder || "All"}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ─── Table helpers ──────────────────────────────────────────── */
const TH = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.7px",
  color: T.muted,
  borderBottom: `1px solid ${T.border}`,
  background: T.pageBg,
  whiteSpace: "nowrap",
};

const td = (isLast) => ({
  padding: "11px 14px",
  borderBottom: isLast ? "none" : `1px solid ${T.border}`,
  fontSize: 13, color: T.text,
  verticalAlign: "middle",
});

/* ─── Badge pill ─────────────────────────────────────────────── */
function Pill({ label, color, bg, border }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11.5, fontWeight: 700,
      color, background: bg,
      border: border ? `1px solid ${border}` : "none",
      padding: "2px 9px", borderRadius: 99,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

/* ─── Day Range Picker ───────────────────────────────────────── */
const DAY_OPTIONS = [
  { label: "3D",  days: 3  },
  { label: "7D",  days: 7  },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
];

function DayRangePicker({ value, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 9, padding: 3, gap: 2,
    }}>
      {DAY_OPTIONS.map(({ label, days }) => {
        const active = value === days;
        return (
          <button
            key={days}
            onClick={() => onChange(days)}
            style={{
              height: 28, minWidth: 40,
              borderRadius: 7, border: "none",
              background: active ? T.white : "transparent",
              color: active ? T.red : T.muted,
              fontWeight: active ? 700 : 500,
              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
              padding: "0 10px",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
const SiteDashboard = () => {
  const [stats,          setStats]          = useState(null);
  const [activeList,     setActiveList]     = useState([]);
  const [alarmList,      setAlarmList]      = useState([]);
  const [alarmTrend,     setAlarmTrend]     = useState([]);
  const [alarmByType,    setAlarmByType]    = useState([]);
  const [alarmByCircle,  setAlarmByCircle]  = useState([]);
  const [activeByCircle, setActiveByCircle] = useState([]);
  const [downSites,      setDownSites]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [selectedDate, setSelectedDate] = useState(todayStr);

  /* — filter state — */
  const [activeSearch,       setActiveSearch]       = useState("");
  const [activeCircleFilter, setActiveCircleFilter] = useState("All");
  const [alarmSearch,        setAlarmSearch]        = useState("");
  const [alarmTypeFilter,    setAlarmTypeFilter]    = useState("All");
  const [alarmCircleFilter,  setAlarmCircleFilter]  = useState("All");

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const p = `?date=${selectedDate}`;
    try {
      const [sRes, alRes, alListRes, trendRes, typeRes, circleRes, acRes, dsRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/SITE-DASHBOARD-STATS${p}`),
        axios.get(`${BASE_URL}/SITE-ACTIVE-LIST`),
        axios.get(`${BASE_URL}/SITE-ALARM-LIST${p}`),
        axios.get(`${BASE_URL}/SITE-ALARM-TREND${p}`),
        axios.get(`${BASE_URL}/SITE-ALARM-BY-TYPE${p}`),
        axios.get(`${BASE_URL}/SITE-ALARM-BY-CIRCLE${p}`),
        axios.get(`${BASE_URL}/SITE-ACTIVE-BY-CIRCLE${p}`),
        axios.get(`${BASE_URL}/SITE-DOWN-LIST${p}`),
      ]);
      if (sRes.status === "fulfilled")      setStats(sRes.value.data);
      if (alRes.status === "fulfilled")     setActiveList(Array.isArray(alRes.value.data) ? alRes.value.data : []);
      if (alListRes.status === "fulfilled") setAlarmList(Array.isArray(alListRes.value.data) ? alListRes.value.data : []);
      if (trendRes.status === "fulfilled")  setAlarmTrend(Array.isArray(trendRes.value.data) ? trendRes.value.data : []);
      if (typeRes.status === "fulfilled")   setAlarmByType(Array.isArray(typeRes.value.data) ? typeRes.value.data : []);
      if (circleRes.status === "fulfilled") setAlarmByCircle(Array.isArray(circleRes.value.data) ? circleRes.value.data : []);
      if (acRes.status === "fulfilled")     setActiveByCircle(Array.isArray(acRes.value.data) ? acRes.value.data : []);
      if (dsRes.status === "fulfilled")     setDownSites(Array.isArray(dsRes.value.data) ? dsRes.value.data : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Site dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* — derived filter options — */
  const activeCircleOpts = [...new Set(activeList.map((r) => r.circle).filter(Boolean))].sort();
  const alarmTypeOpts    = [...new Set(alarmList.map((r) => r.alarm_type).filter(Boolean))].sort();
  const alarmCircleOpts  = [...new Set(alarmList.map((r) => r.circle).filter(Boolean))].sort();

  /* — filtered rows — */
  const filteredActive = activeList.filter((r) => {
    const q = activeSearch.toLowerCase();
    const matchQ = !q ||
      (r.site_name || "").toLowerCase().includes(q) ||
      (r.site_id   || "").toLowerCase().includes(q) ||
      (r.circle    || "").toLowerCase().includes(q);
    return matchQ && (activeCircleFilter === "All" || r.circle === activeCircleFilter);
  });

  const filteredAlarm = alarmList.filter((r) => {
    const q = alarmSearch.toLowerCase();
    const matchQ = !q ||
      (r.site_name || "").toLowerCase().includes(q) ||
      (r.global_id || "").toLowerCase().includes(q) ||
      (r.circle    || "").toLowerCase().includes(q);
    return matchQ &&
      (alarmTypeFilter   === "All" || r.alarm_type === alarmTypeFilter) &&
      (alarmCircleFilter === "All" || r.circle     === alarmCircleFilter);
  });

  const fmtTrendDate = (d) => {
    if (!d) return "";
    try {
      const date = new Date(d);
      // Use UTC methods to avoid timezone-based day shifts
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = months[date.getUTCMonth()];
      const day = date.getUTCDate();
      return `${month} ${day}`;
    } catch { return d; }
  };

  /* ── Loader ── */
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${T.border}`, borderTop: `3px solid ${T.red}`, animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: T.muted, fontSize: 14, fontWeight: 500 }}>Loading site dashboard…</p>
      </div>
    );
  }

  const {
    total_active_sites         = 0,
    total_alarm_events         = 0,
    unique_alarm_sites         = 0,
    circles_affected           = 0,
    avg_alarm_duration_minutes = 0,
  } = stats || {};

  const totalKnown = total_active_sites + unique_alarm_sites;
  const uptimePct  = totalKnown ? Math.round((total_active_sites / totalKnown) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.4px" }}>Site Dashboard</h2>
          {lastUpdated && (
            <p style={{ fontSize: 12, color: T.muted, margin: "3px 0 0" }}>
              Last updated: {lastUpdated.toLocaleTimeString()} · Showing: {selectedDate}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setAlarmTypeFilter("All");
              setAlarmCircleFilter("All");
              setAlarmSearch("");
            }}
            style={{
              height: 34, padding: "0 10px",
              borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.pageBg, fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
              color: T.text, outline: "none", cursor: "pointer",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = T.red; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
          />
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
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.86" />
              </svg>
              Refresh Data
            </>
          )}
        </button>
        </div>
      </div>

      {/* ── 6 KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
        <SiteStatCard
          label="Active Sites"
          value={total_active_sites.toLocaleString()}
          icon={Wifi}
          accent={T.green}
          bg={T.greenBg}
          sub={`${uptimePct}% network uptime`}
        />
        <SiteStatCard
          label="Alarm Events"
          value={total_alarm_events.toLocaleString()}
          icon={AlertTriangle}
          accent={T.red}
          bg={T.redBg}
          sub={selectedDate}
        />
        <SiteStatCard
          label="Sites with Alarms"
          value={unique_alarm_sites.toLocaleString()}
          icon={WifiOff}
          accent={T.orange}
          bg={T.orangeBg}
          sub="Unique affected sites"
        />
        <SiteStatCard
          label="Circles Affected"
          value={circles_affected.toLocaleString()}
          icon={Globe}
          accent={T.purple}
          bg={T.purpleBg}
          sub="States / circles"
        />
        <SiteStatCard
          label="Avg Alarm Duration"
          value={`${Math.round(avg_alarm_duration_minutes)} min`}
          icon={Clock}
          accent={T.blue}
          bg={T.blueBg}
          sub="Per alarm event"
        />
        <SiteStatCard
          label="Down Sites"
          value={downSites.length.toLocaleString()}
          icon={AlertTriangle}
          accent={T.red}
          bg={T.redBg}
          sub="Currently out of service"
        />
      </div>

      {/* ── Row: Trend Line + Alarm by Type ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20 }}>

        {/* Alarm Trend */}
        <SectionCard
          title="Hourly Alarm Distribution"
          subtitle={`Alarm events by hour for ${selectedDate}`}
          icon={Activity}
          accent={T.red}
          accentBg={T.redBg}
        >
          <div style={{ padding: "20px 24px 24px" }}>
            {alarmTrend.every(d => d.count === 0) ? (
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 14 }}>
                No alarm data for this date
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={alarmTrend} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={{ stroke: T.border }} tickLine={false} dy={8}
                    interval={2}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.025)" }} />
                  <Bar dataKey="count" name="Alarms" fill={T.red} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* Alarms by Type */}
        <SectionCard
          title="Alarms by Type"
          subtitle="Distribution of alarm events by type"
          icon={Radio}
          accent={T.orange}
          accentBg={T.orangeBg}
        >
          <div style={{ padding: "20px 24px 24px" }}>
            {alarmByType.length === 0 ? (
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 14 }}>
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={alarmByType.slice(0, 8)} margin={{ left: 4, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                  <XAxis
                    type="number" allowDecimals={false}
                    tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="alarm_type" width={76}
                    tick={{ fontSize: 10, fill: T.text, fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.025)" }} />
                  <Bar dataKey="count" name="Events" fill={T.orange} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Row: Alarm by Circle + Active by Circle ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Alarm Events by Circle */}
        <SectionCard
          title="Alarm Events by Circle"
          subtitle="Which circles have the most alarm events"
          icon={MapPin}
          accent={T.red}
          accentBg={T.redBg}
        >
          <div style={{ padding: "20px 24px 24px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={alarmByCircle} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis
                  dataKey="circle"
                  tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={{ stroke: T.border }} tickLine={false} interval={0} dy={8}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.025)" }} />
                <Bar dataKey="count" name="Alarms" fill={T.red} radius={[5, 5, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Active Sites by Circle */}
        <SectionCard
          title="Active Sites by Circle"
          subtitle="Distribution of healthy sites per circle"
          icon={Wifi}
          accent={T.green}
          accentBg={T.greenBg}
        >
          <div style={{ padding: "20px 24px 24px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activeByCircle} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis
                  dataKey="circle"
                  tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={{ stroke: T.border }} tickLine={false} interval={0} dy={8}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: T.muted, fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.025)" }} />
                <Bar dataKey="count" name="Active Sites" fill={T.green} radius={[5, 5, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* ── Active Sites Table ── */}
      <SectionCard
        title="Active Sites"
        subtitle="All currently active sites from Site_Status"
        icon={Wifi}
        accent={T.green}
        accentBg={T.greenBg}
        badge={`${filteredActive.length} / ${activeList.length}`}
        action={
          <>
            <SearchInput value={activeSearch} onChange={setActiveSearch} placeholder="Search sites…" />
            <FilterSelect value={activeCircleFilter} onChange={setActiveCircleFilter} options={activeCircleOpts} placeholder="All Circles" />
          </>
        }
      >
        <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Site ID", "Site Name", "Circle", "Region (H1)", "Battery (V)", "Signal (dBm)", "Last Communication", "Aging"].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredActive.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "40px 20px", color: T.muted, fontSize: 14 }}>
                    No sites match the current filters
                  </td>
                </tr>
              ) : filteredActive.map((row, i) => {
                const isLast   = i === filteredActive.length - 1;
                const aging    = row.aging || "";
                const isRecent = aging.toLowerCase().includes("seconds") || aging.toLowerCase().includes("minutes");
                const battV    = parseFloat(row.battery_v);
                return (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? T.white : "#FAFAF8", transition: "background 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F5FAF7")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : "#FAFAF8")}
                  >
                    <td style={td(isLast)}>
                      <Pill label={row.site_id || "—"} color={T.green} bg={T.greenBg} />
                    </td>
                    <td style={{ ...td(isLast), fontWeight: 600, maxWidth: 200 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.site_name || "—"}
                      </span>
                    </td>
                    <td style={td(isLast)}>
                      <Pill label={row.circle || "—"} color={T.purple} bg={T.purpleBg} />
                    </td>
                    <td style={{ ...td(isLast), color: T.muted }}>{row.h1 || "—"}</td>
                    <td style={td(isLast)}>
                      <span style={{ fontWeight: 700, color: !isNaN(battV) && battV >= 50 ? T.green : T.orange }}>
                        {row.battery_v ? `${row.battery_v} V` : "—"}
                      </span>
                    </td>
                    <td style={{ ...td(isLast), fontWeight: 600 }}>
                      {row.signal_dbm ? `${row.signal_dbm} dBm` : "—"}
                    </td>
                    <td style={{ ...td(isLast), color: T.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                      {row.last_communication || "—"}
                    </td>
                    <td style={td(isLast)}>
                      <Pill
                        label={aging || "—"}
                        color={isRecent ? T.green : T.orange}
                        bg={isRecent ? T.greenBg : T.orangeBg}
                        border={isRecent ? "rgba(5,150,105,0.2)" : "rgba(217,119,6,0.2)"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredActive.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, background: T.pageBg, fontSize: 12, color: T.muted, textAlign: "right" }}>
            Showing {filteredActive.length} of {activeList.length} active sites
          </div>
        )}
      </SectionCard>

      {/* ── Alarm Events Table ── */}
      <SectionCard
        title="Alarm Events"
        subtitle={`Alarm report for ${selectedDate} — site outage events`}
        icon={AlertTriangle}
        accent={T.red}
        accentBg={T.redBg}
        badge={`${filteredAlarm.length} / ${alarmList.length}`}
        action={
          <>
            <SearchInput value={alarmSearch} onChange={setAlarmSearch} placeholder="Search alarms…" />
            <FilterSelect value={alarmTypeFilter}   onChange={setAlarmTypeFilter}   options={alarmTypeOpts}   placeholder="All Alarm Types" />
            <FilterSelect value={alarmCircleFilter} onChange={setAlarmCircleFilter} options={alarmCircleOpts} placeholder="All Circles"    />
          </>
        }
      >
        <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Global ID", "Site Name", "Circle", "District", "Alarm Type", "Start Time", "End Time", "Duration", "Batt. Start (V)", "Batt. End (V)"].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAlarm.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "40px 20px", color: T.muted, fontSize: 14 }}>
                    No alarm events match the current filters
                  </td>
                </tr>
              ) : filteredAlarm.slice(0, 200).map((row, i) => {
                const isLast = i === Math.min(filteredAlarm.length, 200) - 1;
                return (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? T.white : "#FFF9F9", transition: "background 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF0F0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : "#FFF9F9")}
                  >
                    <td style={td(isLast)}>
                      <Pill label={row.global_id || "—"} color={T.red} bg={T.redBg} />
                    </td>
                    <td style={{ ...td(isLast), fontWeight: 600, maxWidth: 180 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.site_name || "—"}
                      </span>
                    </td>
                    <td style={td(isLast)}>
                      <Pill label={row.circle || "—"} color={T.purple} bg={T.purpleBg} />
                    </td>
                    <td style={{ ...td(isLast), color: T.muted }}>{row.district || "—"}</td>
                    <td style={td(isLast)}>
                      <Pill
                        label={row.alarm_type || "—"}
                        color={T.orange}
                        bg={T.orangeBg}
                        border="rgba(217,119,6,0.2)"
                      />
                    </td>
                    <td style={{ ...td(isLast), color: T.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                      {row.alarm_start_time || "—"}
                    </td>
                    <td style={{ ...td(isLast), color: T.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                      {row.alarm_end_time || "—"}
                    </td>
                    <td style={td(isLast)}>
                      <Pill label={row.duration || "—"} color={T.blue} bg={T.blueBg} />
                    </td>
                    <td style={{ ...td(isLast), fontWeight: 600 }}>
                      {row.battery_start_v ? `${row.battery_start_v} V` : "—"}
                    </td>
                    <td style={{ ...td(isLast), fontWeight: 600 }}>
                      {row.battery_end_v ? `${row.battery_end_v} V` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAlarm.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, background: T.pageBg, fontSize: 12, color: T.muted, textAlign: "right" }}>
            Showing {Math.min(200, filteredAlarm.length).toLocaleString()} of {filteredAlarm.length.toLocaleString()} results
            &nbsp;·&nbsp; {alarmList.length.toLocaleString()} total alarm events
          </div>
        )}
      </SectionCard>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default SiteDashboard;
