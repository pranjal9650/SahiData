import React, { useEffect, useState } from "react";
import axios from "axios";
import { MapPin, CheckCircle2, AlertTriangle, Layers, Search, X } from "lucide-react";

const BASE_URL = "http://127.0.0.1:8000";

/* ─── Design tokens (mirrors App.js / Dashboard.js) ─────────── */
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
  blue:     "#2563EB",
  blueBg:   "rgba(37,99,235,0.07)",
  text:     "#111111",
  muted:    "#71717A",
};

/* ─── Stat card (mirrors Dashboard.js StatCard) ──────────────── */
function StatCard({ label, value, icon: Icon, accent, bg }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.white,
        borderRadius: 14,
        border: `1px solid ${T.grey200}`,
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.18s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-2px)" : "none",
        cursor: "default",
      }}
    >
      {/* Top accent strip */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 3, background: accent, borderRadius: "14px 14px 0 0",
      }} />

      {/* Icon + label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {label}
        </span>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: bg, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} color={accent} />
        </div>
      </div>

      {/* Value */}
      <div style={{ fontSize: 32, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: -1 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/* ─── View mode toggle button ────────────────────────────────── */
function ViewBtn({ active, accent, accentBg, onClick, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        border: `1px solid ${active ? accent : T.grey200}`,
        background: active ? accentBg : hovered ? T.grey100 : T.white,
        color: active ? accent : hovered ? T.text : T.muted,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
const SiteMonitoring = () => {
  const [summary, setSummary]           = useState(null);
  const [downSites, setDownSites]       = useState([]);
  const [upSites, setUpSites]           = useState([]);
  const [filteredDown, setFilteredDown] = useState([]);
  const [filteredUp, setFilteredUp]     = useState([]);
  const [startDate, setStartDate]       = useState("");
  const [endDate, setEndDate]           = useState("");
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [viewMode, setViewMode]         = useState("all");
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => { fetchData(); }, []);   // eslint-disable-line

  /* ── Fetch ── */
  const fetchData = async () => {
    try {
      setLoading(true);
      const query =
        startDate && endDate ? `?start_date=${startDate}&end_date=${endDate}` : "";

      const [summaryRes, downRes, upRes] = await Promise.all([
        axios.get(`${BASE_URL}/SITE-MONITORING${query}`),
        axios.get(`${BASE_URL}/SITE-DOWN${query}`),
        axios.get(`${BASE_URL}/SITE-UP${query}`),
      ]);

      setSummary(summaryRes.data);
      setDownSites(downRes.data);
      setFilteredDown(downRes.data);
      setUpSites(upRes.data);
      setFilteredUp(upRes.data);

      const combinedData = [
        ...upRes.data.map((s) => ({ ...s, status: "Active" })),
        ...downRes.data.map((s) => ({ ...s, status: "Outage" })),
      ];
      await axios.post(`${BASE_URL}/SAVE-SITE-DATA`, combinedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ── Search filter ── */
  useEffect(() => {
    if (!search) {
      setFilteredDown(downSites);
      setFilteredUp(upSites);
      return;
    }
    const lower = search.toLowerCase();
    setFilteredDown(downSites.filter(
      (s) => s.site_name?.toLowerCase().includes(lower) || s.global_id?.toLowerCase().includes(lower)
    ));
    setFilteredUp(upSites.filter(
      (s) => s.site_name?.toLowerCase().includes(lower) || s.global_id?.toLowerCase().includes(lower)
    ));
  }, [search, downSites, upSites]);

  /* ── Loader ── */
  if (loading || !summary) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "60vh", gap: 16, fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          border: `3px solid ${T.grey200}`,
          borderTop: `3px solid ${T.red}`,
          animation: "spin 0.9s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: T.muted, fontSize: 14, fontWeight: 500, margin: 0 }}>
          Loading site monitoring…
        </p>
      </div>
    );
  }

  const showActive = viewMode === "all" || viewMode === "active";
  const showOutage = viewMode === "all" || viewMode === "outage";

  /* ── Table shared styles ── */
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
  };

  /* ─────────────────── RENDER ─────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <StatCard
          label="Total Sites"
          value={summary.total_sites}
          icon={Layers}
          accent={T.blue}
          bg={T.blueBg}
        />
        <StatCard
          label="Active Sites"
          value={summary.up_sites}
          icon={CheckCircle2}
          accent={T.green}
          bg={T.greenBg}
        />
        <StatCard
          label="Outage Sites"
          value={summary.down_sites}
          icon={AlertTriangle}
          accent={T.red}
          bg={T.redBg}
        />
      </div>

      {/* ── Filters ── */}
      <div style={{
        background: T.white,
        borderRadius: 14,
        border: `1px solid ${T.grey200}`,
        padding: "16px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
      }}>
        {/* Date range */}
        {[
          { label: "From", value: startDate, setter: setStartDate },
          { label: "To",   value: endDate,   setter: setEndDate   },
        ].map(({ label, value, setter }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: T.muted, whiteSpace: "nowrap" }}>
              {label}
            </label>
            <input
              type="date"
              value={value}
              onChange={(e) => setter(e.target.value)}
              style={{
                padding: "9px 13px",
                borderRadius: 8,
                border: `1px solid ${T.grey200}`,
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                background: T.grey100,
                color: T.text,
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = T.red;
                e.target.style.boxShadow   = "0 0 0 3px rgba(204,0,0,0.10)";
                e.target.style.background  = T.white;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = T.grey200;
                e.target.style.boxShadow   = "none";
                e.target.style.background  = T.grey100;
              }}
            />
          </div>
        ))}

        {/* Apply button */}
        <button
          onClick={fetchData}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            background: T.red,
            color: T.white,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            transition: "background 0.15s, transform 0.15s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => { e.target.style.background = T.redDark; e.target.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.target.style.background = T.red; e.target.style.transform = "none"; }}
        >
          🔍 Apply Filter
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: T.grey200 }} />

        {/* View toggle */}
        <ViewBtn active={viewMode === "all"} accent={T.blue} accentBg={T.blueBg} onClick={() => setViewMode("all")}>
          <Layers size={13} /> All Sites
        </ViewBtn>
        <ViewBtn active={viewMode === "active"} accent={T.green} accentBg={T.greenBg} onClick={() => setViewMode("active")}>
          <CheckCircle2 size={13} /> Active
        </ViewBtn>
        <ViewBtn active={viewMode === "outage"} accent={T.red} accentBg={T.redBg} onClick={() => setViewMode("outage")}>
          <AlertTriangle size={13} /> Outage
        </ViewBtn>

        {/* Search */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: searchFocused ? T.white : T.grey100,
          border: `1px solid ${searchFocused ? T.red : T.grey200}`,
          borderRadius: 9,
          padding: "8px 12px",
          flex: 1,
          minWidth: 200,
          transition: "all 0.15s ease",
          boxShadow: searchFocused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none",
          marginLeft: "auto",
        }}>
          <Search size={13} color={T.muted} style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search by site name or site ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              flex: 1, border: "none", background: "transparent",
              outline: "none", fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", color: T.text,
            }}
          />
          {search && (
            <X
              size={12}
              color={T.muted}
              style={{ cursor: "pointer", flexShrink: 0 }}
              onClick={() => setSearch("")}
            />
          )}
        </div>
      </div>

      {/* ── Active Sites Table ── */}
      {showActive && (
        <div style={{
          background: T.white,
          borderRadius: 14,
          border: `1px solid ${T.grey200}`,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          {/* Card header */}
          <div style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${T.grey200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: T.greenBg,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckCircle2 size={16} color={T.green} />
              </div>
              <div>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0 }}>
                  Active Sites
                </h3>
                <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
                  Sites currently online and operational
                </p>
              </div>
            </div>
            <span style={{
              padding: "4px 12px",
              borderRadius: 99,
              background: T.greenBg,
              color: T.green,
              fontSize: 12.5,
              fontWeight: 600,
            }}>
              {filteredUp.length} sites
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 500 }}>
              <thead>
                <tr>
                  {["Site Name", "Site ID", "Status", "Since"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUp.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "32px 20px" }}>
                      No active sites found
                    </td>
                  </tr>
                ) : filteredUp.map((site, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(5,150,105,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MapPin size={13} color={T.green} style={{ flexShrink: 0 }} />
                        {site.site_name}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: T.muted, fontFamily: "monospace", fontSize: 12.5 }}>
                      {site.global_id}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 99,
                        background: T.greenBg, color: T.green,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
                        Active
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>
                      {site.since && site.since !== "Running" ? site.since : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Outage Sites Table ── */}
      {showOutage && (
        <div style={{
          background: T.white,
          borderRadius: 14,
          border: `1px solid ${T.grey200}`,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          {/* Card header */}
          <div style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${T.grey200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: T.redBg,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={16} color={T.red} />
              </div>
              <div>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0 }}>
                  Outage Sites
                </h3>
                <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
                  Sites experiencing connectivity issues
                </p>
              </div>
            </div>
            <span style={{
              padding: "4px 12px",
              borderRadius: 99,
              background: T.redBg,
              color: T.red,
              fontSize: 12.5,
              fontWeight: 600,
            }}>
              {filteredDown.length} sites
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 600 }}>
              <thead>
                <tr>
                  {["Site Name", "Site ID", "Alarm", "Since", "End Time"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDown.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: T.muted, padding: "32px 20px" }}>
                      No outage sites found
                    </td>
                  </tr>
                ) : filteredDown.map((site, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? T.white : T.grey100 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(204,0,0,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.white : T.grey100)}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MapPin size={13} color={T.red} style={{ flexShrink: 0 }} />
                        {site.site_name}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: T.muted, fontFamily: "monospace", fontSize: 12.5 }}>
                      {site.global_id}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 99,
                        background: T.redBg, color: T.red,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {site.alarm}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>{site.since}</td>
                    <td style={{ ...tdStyle, color: T.muted, fontSize: 13 }}>{site.end_time || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default SiteMonitoring;