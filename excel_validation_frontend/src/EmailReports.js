import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Upload, CheckCircle, AlertCircle, Clock, Send,
  FileSpreadsheet, FileText, RefreshCw, Info,
  Trash2, AlertTriangle, Calendar, Settings,
} from "lucide-react";

const API = "http://127.0.0.1:8001";




const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  redLight: "rgba(204,0,0,0.07)",
  black:    "#111111",
  white:    "#FFFFFF",
  grey500:  "#6B7280",
  green:    "#16a34a",
  greenBg:  "#f0fdf4",
  amber:    "#d97706",
  amberBg:  "#fffbeb",
};

const FILE_SLOTS = [
  {
    key:         "employee_manager",
    combinedKeys: ["employee", "managers"],
    label:       "Employee Details",
    description: "Master list — Name, Username, Manager, City, Circle",
    accept:      ".xlsx,.xls",
    icon:        FileSpreadsheet,
    freq:        "Monthly / as updated",
    noDateCheck: true,
  },
  {
    key:         "attendance",
    label:       "Attendance Report",
    description: "Daily attendance — Username, Present / Absent status",
    accept:      ".xlsx,.xls",
    icon:        FileSpreadsheet,
    freq:        "Daily",
  },
  {
    key:         "distance",
    label:       "Distance Report",
    description: "Travel data — Username, KMs covered today",
    accept:      ".xlsx,.xls",
    icon:        FileSpreadsheet,
    freq:        "Daily",
  },
  {
    key:         "forms_combined",
    combinedKeys: ["forms", "forms_filled"],
    label:       "Forms Filled",
    description: "Form submission counts — Username, Form Type, Count",
    accept:      ".xlsx,.xls",
    icon:        FileSpreadsheet,
    freq:        "Daily",
    noDateCheck: true,
  },
  {
    key:         "alarm",
    label:       "Sites Down",
    description: "Site outage data — Global ID, Site Name, State / Circle",
    accept:      "*",
    icon:        FileText,
    freq:        "Daily",
  },
  {
    key:         "active_sites",
    label:       "Active Sites Report",
    description: "Active site list — State/Circle, Site ID, Site Name (one row per site)",
    accept:      "*",
    icon:        FileText,
    freq:        "Daily",
    noDateCheck: true,
  },
  {
    key:         "site_master",
    label:       "Site Master",
    description: "Master site list — Global ID, Site Name, State/Circle, Latitude, Longitude",
    accept:      ".xlsx,.xls,.csv",
    icon:        FileSpreadsheet,
    freq:        "Monthly / as updated",
    noDateCheck: true,
  },
];

// ── helpers ───────────────────────────────────────────────────────────

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear()
      && d.getMonth()    === n.getMonth()
      && d.getDate()     === n.getDate();
}

function relLabel(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// ── File card ─────────────────────────────────────────────────────────

function FileCard({ slot, statusData, onUpload, uploadingKey, reportDate }) {
  const inputRef = useRef(null);
  const [drag,  setDrag]  = useState(false);
  const [hover, setHover] = useState(false);

  const keys     = slot.combinedKeys || [slot.key];
  const infos    = keys.map(k => statusData[k] || {});
  const info     = infos[0];
  const meta     = info.meta;
  const uploaded = infos.every(i => i.uploaded && !!i.meta);
  const fresh    = uploaded && infos.every(i => isToday(i.meta?.uploaded_at));
  const stale    = infos.some(i => i.uploaded && !!i.meta) && !fresh;
  const busy     = uploadingKey === slot.key;
  const Icon     = slot.icon;

  const skipDateCheck = slot.noDateCheck;
  const dataDate      = meta?.data_date || null;
  const dateMismatch  = !skipDateCheck && uploaded && dataDate && reportDate && dataDate !== reportDate;

  const pick = (file) => { if (file) onUpload(slot.key, file); };

  const isReady   = fresh && !dateMismatch;
  const isWarning = dateMismatch || stale;
  const accentColor = isReady ? "#22c55e" : isWarning ? "#f59e0b" : "rgba(204,0,0,0.25)";
  const iconBg    = isReady ? "rgba(34,197,94,0.10)" : isWarning ? "rgba(245,158,11,0.10)" : "rgba(204,0,0,0.07)";
  const iconColor = isReady ? "#16a34a" : isWarning ? "#d97706" : "#CC0000";
  const borderColor = isReady ? "#86efac" : isWarning ? "#fca5a5" : "rgba(204,0,0,0.18)";
  const cardBg    = hover
    ? (isReady ? "rgba(34,197,94,0.07)" : isWarning ? "rgba(239,68,68,0.05)" : "rgba(204,0,0,0.04)")
    : "#ffffff";
  const fmt = slot.accept === "*" ? "CSV · XLSX" : slot.accept.replace(/\./g, "").toUpperCase().replace(/,/g, " · ");

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: cardBg,
        borderRadius: 14,
        border: `1.5px solid ${borderColor}`,
        boxShadow: hover ? "0 8px 24px rgba(0,0,0,0.09)" : "0 1px 4px rgba(0,0,0,0.05)",
        padding: "10px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        overflow: "hidden",
        transition: "box-shadow .2s, transform .18s, background .2s, border-color .2s",
        transform: hover ? "translateY(-2px)" : "none",
      }}
    >
      {/* header: icon box + title/freq + dot */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .2s" }}>
          <Icon size={9} color={iconColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", letterSpacing: "-0.2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>
            {slot.label}
          </div>
          {slot.freq && (
            <div style={{ fontSize: 10, color: "#C4CBD8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.freq}</div>
          )}
        </div>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor, flexShrink: 0, marginTop: 2, transition: "background .2s" }} />
      </div>

      {/* badge */}
      <div>
        {isReady ? (
          <span style={badge("#15803d", "#f0fdf4", "#bbf7d0")}><CheckCircle size={8} /> Ready</span>
        ) : dateMismatch ? (
          <span style={badge("#b45309", "#fefce8", "#fde68a")}><AlertTriangle size={8} /> Mismatch</span>
        ) : stale ? (
          <span style={badge("#b45309", "#fefce8", "#fde68a")}><AlertTriangle size={8} /> Outdated</span>
        ) : (
          <span style={badge("#CC0000", "rgba(204,0,0,0.06)", "rgba(204,0,0,0.20)")}><Clock size={8} /> Pending</span>
        )}
      </div>

      {/* compact file info */}
      {uploaded && meta && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.original_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 9.5, color: "#9CA3AF", flexWrap: "wrap" }}>
            <span>{relLabel(meta.uploaded_at)}</span>
            {dataDate && !skipDateCheck && (
              <span style={{ fontWeight: 700, color: dateMismatch ? "#d97706" : "#16a34a" }}>· {dataDate}</span>
            )}
          </div>
          {(dateMismatch || stale) && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2, fontSize: 9, color: "#d97706", overflow: "hidden" }}>
              <AlertTriangle size={8} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dateMismatch ? `${dataDate} ≠ ${reportDate}` : "Re-upload today"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* spacer pushes upload zone to bottom */}
      <div style={{ flex: 1 }} />

      {/* upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          borderRadius: 8,
          border: `1.5px dashed ${drag ? T.red : uploaded ? "#E2E8F0" : "#D8DFE8"}`,
          padding: uploaded ? "4px 8px" : "8px 6px",
          display: "flex",
          flexDirection: uploaded ? "row" : "column",
          alignItems: "center",
          justifyContent: uploaded ? "flex-start" : "center",
          gap: uploaded ? 6 : 5,
          cursor: busy ? "not-allowed" : "pointer",
          background: drag ? "#FFF5F5" : uploaded ? "#FAFBFD" : "#F7F9FC",
          transition: "all .15s",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {uploaded ? (
          <>
            {busy
              ? <RefreshCw size={10} color={T.red} style={{ flexShrink: 0, animation: "spin 1s linear infinite" }} />
              : <Upload size={10} color={drag ? T.red : "#C4CBD8"} style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 11, color: busy ? T.red : "#B8C0CC", fontWeight: 500 }}>
              {busy ? "Uploading…" : "Drop to replace"}
            </span>
            {!busy && <span style={{ fontSize: 10, color: "#D1D5DB", flexShrink: 0 }}>{fmt}</span>}
          </>
        ) : (
          <>
            <div style={{ width: 22, height: 22, borderRadius: 7, background: drag ? "#FEE2E2" : "rgba(204,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
              {busy
                ? <RefreshCw size={10} color={T.red} style={{ animation: "spin 1s linear infinite" }} />
                : <Upload size={10} color={drag ? T.red : "#CC0000"} />}
            </div>
            <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, textAlign: "center" }}>
              {busy ? "Uploading…" : "Click or drop"}
            </span>
            {!busy && <span style={{ fontSize: 10, color: "#C4CBD8" }}>{fmt}</span>}
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept={slot.accept} style={{ display: "none" }} onChange={(e) => pick(e.target.files[0])} />
    </div>
  );
}

function badge(color, bg, borderColor) {
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    fontSize: 10, fontWeight: 700, color,
    background: bg, border: `1px solid ${borderColor}`,
    borderRadius: 4, padding: "2px 6px",
    whiteSpace: "nowrap", letterSpacing: "0.1px",
  };
}

// ── WFH / WFO card (fits inside the 3-column file grid) ──────────────

function WfhWfoCard({ wfhAnalyzing, wfhInputRef, onAnalyze, onClear, wfhClearing, wfhStoredAt, wfhStoredCount, serverOnline, wfhConfig, wfhConfigDraft, setWfhConfigDraft, onSaveWfhConfig, savingWfhConfig, offices, onAddOffice, onUpdateOffice, onDeleteOffice }) {
  const [drag,  setDrag]        = useState(false);
  const [hover, setHover]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [officeForm,     setOfficeForm]     = useState({ name: "", lat: "", lng: "" });
  const [editingOffice,  setEditingOffice]  = useState(null); // office name being edited
  const [showAddOffice,  setShowAddOffice]  = useState(false);
  const [savingOffice,   setSavingOffice]   = useState(false);

  const draft   = wfhConfigDraft || wfhConfig;
  const isDirty = wfhConfigDraft !== null;
  const hasSaved = !!wfhStoredAt;
  const accentColor = hasSaved ? "#22c55e" : "rgba(204,0,0,0.25)";
  const iconBg      = hasSaved ? "rgba(34,197,94,0.10)" : "rgba(204,0,0,0.07)";
  const iconColor   = hasSaved ? "#16a34a" : "#CC0000";
  const borderColor = hasSaved ? "#86efac" : "rgba(204,0,0,0.18)";
  const cardBg      = hover
    ? (hasSaved ? "rgba(34,197,94,0.07)" : "rgba(204,0,0,0.04)")
    : "#ffffff";

  const addFiles = (files) => {
    const csvs = Array.from(files).filter(f => f.name.endsWith(".csv"));
    if (csvs.length && serverOnline === true) onAnalyze(csvs);
  };

  return (
    <div style={{ position: "relative", zIndex: showSettings ? 20 : undefined }}>

      {/* ── card (always square, never grows) ── */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: cardBg,
          borderRadius: 14,
          border: `1.5px solid ${borderColor}`,
          boxShadow: hover ? "0 8px 24px rgba(0,0,0,0.09)" : "0 1px 4px rgba(0,0,0,0.05)",
          padding: "10px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          overflow: "hidden",
          transition: "box-shadow .2s, transform .18s, background .2s, border-color .2s",
          transform: hover ? "translateY(-2px)" : "none",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .2s" }}>
            {wfhAnalyzing
              ? <RefreshCw size={9} color="#059669" style={{ animation: "spin 1s linear infinite" }} />
              : <FileText size={9} color={iconColor} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>WFH / WFO</div>
            <div style={{ fontSize: 10, color: "#C4CBD8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Daily</div>
          </div>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor, flexShrink: 0, marginTop: 3, transition: "background .2s" }} />
        </div>

        {/* badge */}
        <div>
          {wfhAnalyzing ? (
            <span style={badge("#059669", "#f0fdf4", "#a7f3d0")}><RefreshCw size={8} style={{ animation: "spin 1s linear infinite" }} /> Processing</span>
          ) : hasSaved ? (
            <span style={badge("#15803d", "#f0fdf4", "#bbf7d0")}><CheckCircle size={8} /> Ready</span>
          ) : (
            <span style={badge("#CC0000", "rgba(204,0,0,0.06)", "rgba(204,0,0,0.20)")}><Clock size={8} /> Pending</span>
          )}
        </div>

        {/* saved info */}
        {hasSaved && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#9CA3AF" }}>
            <span style={{ fontWeight: 700, color: "#16a34a" }}>{wfhStoredCount} emp.</span>
            <span>ready</span>
            <button onClick={onClear} disabled={wfhClearing}
              style={{ ...actionBtn(T.red, "#fef2f2"), fontSize: 10.5, padding: "2px 8px", marginLeft: "auto" }}>
              {wfhClearing ? "…" : "Clear"}
            </button>
          </div>
        )}

        {/* spacer pushes upload zone to bottom */}
        <div style={{ flex: 1 }} />

        {/* upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => !wfhAnalyzing && wfhInputRef.current?.click()}
          style={{
            borderRadius: 8,
            border: `1.5px dashed ${drag ? "#059669" : "#DDE3ED"}`,
            padding: hasSaved ? "4px 8px" : "8px 6px",
            display: "flex",
            flexDirection: hasSaved ? "row" : "column",
            alignItems: "center",
            justifyContent: hasSaved ? "flex-start" : "center",
            gap: hasSaved ? 6 : 5,
            cursor: wfhAnalyzing ? "not-allowed" : "pointer",
            background: drag ? "rgba(5,150,105,0.04)" : "#FAFBFD",
            transition: "all .15s",
            opacity: wfhAnalyzing ? 0.7 : 1,
          }}
        >
          {hasSaved ? (
            <>
              {wfhAnalyzing
                ? <RefreshCw size={10} color="#059669" style={{ flexShrink: 0, animation: "spin 1s linear infinite" }} />
                : <Upload size={10} color={drag ? "#059669" : "#C4CBD8"} style={{ flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: 11, color: wfhAnalyzing ? "#059669" : "#B0B8C8", fontWeight: 500 }}>
                {wfhAnalyzing ? "Analyzing…" : "Drop to replace CSVs"}
              </span>
              {!wfhAnalyzing && <span style={{ fontSize: 10, color: "#D1D5DB", flexShrink: 0 }}>CSV</span>}
            </>
          ) : (
            <>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: drag ? "rgba(5,150,105,0.08)" : "rgba(204,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
                {wfhAnalyzing
                  ? <RefreshCw size={10} color="#059669" style={{ animation: "spin 1s linear infinite" }} />
                  : <Upload size={10} color={drag ? "#059669" : "#CC0000"} />}
              </div>
              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, textAlign: "center" }}>
                {wfhAnalyzing ? "Analyzing…" : "Click or drop CSVs"}
              </span>
              {!wfhAnalyzing && <span style={{ fontSize: 10, color: "#C4CBD8" }}>CSV</span>}
            </>
          )}
        </div>
        <input ref={wfhInputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

        {/* settings toggle */}
        <button
          onClick={() => setShowSettings(s => !s)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, color: showSettings ? "#1E293B" : "#94A3B8", display: "flex", alignItems: "center", gap: 5, transition: "color .15s" }}
        >
          <Settings size={11} /> Settings {showSettings ? "▲" : "▼"}
        </button>
      </div>

      {/* ── settings panel: floats below card, never affects grid ── */}
      {showSettings && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 360,
          zIndex: 50,
          background: "#fff",
          border: "1px solid #E8ECF4",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}>

          {/* ── Office locations ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.black }}>Office Locations</span>
              <button
                onClick={() => { setShowAddOffice(true); setEditingOffice(null); setOfficeForm({ name: "", lat: "", lng: "" }); }}
                style={{ ...actionBtn(T.green, "#f0fdf4"), fontSize: 10, padding: "2px 8px" }}>+ Add</button>
            </div>

            <div style={{ border: "1px solid #F0F2F7", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 76px auto", gap: 6, padding: "6px 8px", background: "#F8FAFC", fontSize: 10, fontWeight: 700, color: T.grey500, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                <span>Name</span><span>Lat</span><span>Lng</span><span>Actions</span>
              </div>

              {(offices || []).map((o) => (
                <div key={o.name} style={{ borderTop: "1px solid #F5F5F5" }}>
                  {editingOffice === o.name ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 76px auto", gap: 6, padding: "5px 8px", alignItems: "center" }}>
                      <input value={officeForm.name} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} style={{ ...tinyInput }} placeholder="Name" />
                      <input value={officeForm.lat} onChange={e => setOfficeForm(f => ({ ...f, lat: e.target.value }))} style={{ ...tinyInput }} placeholder="Lat" />
                      <input value={officeForm.lng} onChange={e => setOfficeForm(f => ({ ...f, lng: e.target.value }))} style={{ ...tinyInput }} placeholder="Lng" />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button disabled={savingOffice} onClick={async () => { setSavingOffice(true); await onUpdateOffice(o.name, officeForm); setEditingOffice(null); setSavingOffice(false); }} style={{ ...actionBtn(T.green, "#f0fdf4"), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>Save</button>
                        <button onClick={() => setEditingOffice(null)} style={{ ...actionBtn(T.grey500, "#F3F4F6"), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 76px auto", gap: 6, padding: "7px 8px", alignItems: "center" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: T.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                      <span style={{ fontSize: 10.5, color: T.grey500, fontVariantNumeric: "tabular-nums" }}>{o.lat}</span>
                      <span style={{ fontSize: 10.5, color: T.grey500, fontVariantNumeric: "tabular-nums" }}>{o.lng}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => { setEditingOffice(o.name); setOfficeForm({ name: o.name, lat: String(o.lat), lng: String(o.lng) }); setShowAddOffice(false); }} style={{ ...actionBtn("#0369a1", "rgba(3,105,161,0.07)"), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>Edit</button>
                        <button onClick={() => onDeleteOffice(o.name)} style={{ ...actionBtn(T.red, T.redLight), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {(offices || []).length === 0 && !showAddOffice && (
                <div style={{ padding: "10px 8px", fontSize: 11, color: T.grey500, textAlign: "center" }}>No offices configured</div>
              )}

              {showAddOffice && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 76px auto", gap: 6, padding: "5px 8px", alignItems: "center", borderTop: "1px solid #F5F5F5", background: "#F0FDF4" }}>
                  <input value={officeForm.name} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} style={{ ...tinyInput }} placeholder="Name" />
                  <input value={officeForm.lat} onChange={e => setOfficeForm(f => ({ ...f, lat: e.target.value }))} style={{ ...tinyInput }} placeholder="Lat" />
                  <input value={officeForm.lng} onChange={e => setOfficeForm(f => ({ ...f, lng: e.target.value }))} style={{ ...tinyInput }} placeholder="Lng" />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button disabled={savingOffice} onClick={async () => { setSavingOffice(true); await onAddOffice(officeForm); setShowAddOffice(false); setOfficeForm({ name: "", lat: "", lng: "" }); setSavingOffice(false); }} style={{ ...actionBtn(T.green, "#f0fdf4"), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>Add</button>
                    <button onClick={() => setShowAddOffice(false)} style={{ ...actionBtn(T.grey500, "#F3F4F6"), fontSize: 10, padding: "3px 7px", fontWeight: 600 }}>✕</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── WFH travel threshold ── */}
          <div>
            <label style={{ fontSize: 12, color: T.grey500, fontWeight: 600 }}>
              WFH min. travel (km)
              <input type="number" min="0.1" step="0.1" value={draft.wfh_travel_km}
                onChange={e => setWfhConfigDraft({ ...draft, wfh_travel_km: parseFloat(e.target.value) || 2.0 })}
                style={{ display: "block", width: "100%", marginTop: 4, border: "1px solid #E2E8F0", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "'DM Sans', sans-serif" }}
              />
            </label>
            {isDirty && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setWfhConfigDraft(null)} style={{ ...actionBtn(T.grey500, "#F3F4F6"), fontSize: 11, padding: "4px 12px" }}>Cancel</button>
                <button onClick={onSaveWfhConfig} disabled={savingWfhConfig} style={{ ...actionBtn("#fff", T.green), fontSize: 11, padding: "4px 12px" }}>
                  {savingWfhConfig ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function EmailReports() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [reportDate,      setReportDate]      = useState(todayISO);
  const [status,          setStatus]          = useState({});
  const [uploadingKey,    setUploadingKey]    = useState(null);
  const [sending,         setSending]         = useState(false);
  const [testSendingType, setTestSendingType] = useState(null);
  const [liveSendingType, setLiveSendingType] = useState(null);
  const [clearing,        setClearing]        = useState(false);
  const [toast,           setToast]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [showModal,       setShowModal]       = useState(false);
  const [previewData,     setPreviewData]     = useState(null);
  const [loadingPreview,  setLoadingPreview]  = useState(false);
  const [testMode,        setTestMode]        = useState(true);
  const [testEmail,       setTestEmail]       = useState("pranjalg.work@gmail.com");
  const [, setTogglingTest]    = useState(false);
  const [mailEnabled,     setMailEnabled]     = useState(true);
  const [togglingMail,    setTogglingMail]    = useState(false);
  const [modalExtraEmails, setModalExtraEmails] = useState("");
  const [serverOnline,    setServerOnline]    = useState(null); // null=checking, true=up, false=down
  const configFetchRef = useRef(false); // prevents concurrent config fetches
  // recipients config panel
  const [config,          setConfig]          = useState(null);
  const [configLoading,   setConfigLoading]   = useState(false);
  const [savingConfig,    setSavingConfig]    = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [editingHead,     setEditingHead]     = useState(null);
  const [headForm,        setHeadForm]        = useState({ circle:"", head:"", email:"", phone:"" });
  const [showAddHead,     setShowAddHead]     = useState(false);
  const [showAddMgmt,     setShowAddMgmt]     = useState(false);
  const [editingMgmt,     setEditingMgmt]     = useState(null);
  const [mgmtForm,        setMgmtForm]        = useState({ name:"", email:"" });
  const [editingManager,  setEditingManager]  = useState(null);
  const [managerForm,     setManagerForm]     = useState({ name:"", email:"", circle:"" });
  const [showAddManager,  setShowAddManager]  = useState(false);
  const [extraInput,      setExtraInput]      = useState("");
  // WFH / WFO
  const [wfhAnalyzing,   setWfhAnalyzing]   = useState(false);
  const [wfhStoredAt,    setWfhStoredAt]    = useState(null);
  const [wfhStoredCount, setWfhStoredCount] = useState(0);
  const [wfhClearing,    setWfhClearing]    = useState(false);
  const wfhInputRef = useRef(null);
  const [wfhConfig,       setWfhConfig]       = useState({ wfh_travel_km: 2.0 });
  const [wfhConfigDraft,  setWfhConfigDraft]  = useState(null);
  const [savingWfhConfig, setSavingWfhConfig] = useState(false);
  const [offices,         setOffices]         = useState([]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  // Single sequential init — if server is down, only 1 request fails (not 4+)
  const initAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: statusData } = await axios.get(`${API}/REPORT-FILES-STATUS`);
      setStatus(statusData);
      setServerOnline(true);
      // Scan uploaded files for data dates (non-blocking, updates metadata in-place)
      try {
        await axios.post(`${API}/SCAN-FILE-DATES`);
        const { data: freshStatus } = await axios.get(`${API}/REPORT-FILES-STATUS`);
        setStatus(freshStatus);
      } catch { /* silent */ }
      // Server confirmed reachable — fetch the rest in parallel
      const [cfgRes, mailRes, testRes] = await Promise.allSettled([
        axios.get(`${API}/REPORTING-CONFIG`),
        axios.get(`${API}/REPORTING-CONFIG/MAIL-STATUS`),
        axios.get(`${API}/REPORTING-CONFIG/TEST-MODE`),
      ]);
      if (cfgRes.status === "fulfilled") {
        setConfig(cfgRes.value.data);
        setExtraInput((cfgRes.value.data.extra_recipients || []).join(", "));
      }
      if (mailRes.status === "fulfilled") {
        setMailEnabled(mailRes.value.data.mail_enabled);
      }
      if (testRes.status === "fulfilled") {
        setTestMode(testRes.value.data.test_mode);
        setTestEmail(testRes.value.data.test_email || "pranjalg.work@gmail.com");
      }
      // Load stored GPS results + thresholds config + offices (non-blocking)
      try {
        const [wfhRes, wfhCfgRes, officesRes] = await Promise.allSettled([
          axios.get(`${API}/WFH-WFO/STATUS`),
          axios.get(`${API}/WFH-WFO/CONFIG`),
          axios.get(`${API}/WFH-WFO/OFFICES`),
        ]);
        if (wfhRes.status === "fulfilled") {
          const validResults = (wfhRes.value.data.results || []).filter(r => r.status === "WFH" || r.status === "WFO");
          setWfhStoredAt(wfhRes.value.data.analyzed_at || null);
          setWfhStoredCount(validResults.length);
        }
        if (wfhCfgRes.status === "fulfilled") {
          setWfhConfig(wfhCfgRes.value.data);
        }
        if (officesRes.status === "fulfilled") {
          setOffices(officesRes.value.data);
        }
      } catch { /* silent */ }
    } catch {
      setServerOnline(false);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = initAll;

  const fetchConfig = useCallback(async () => {
    if (configFetchRef.current) return; // synchronous guard — prevents concurrent fetches
    configFetchRef.current = true;
    setConfigLoading(true);
    try {
      const { data } = await axios.get(`${API}/REPORTING-CONFIG`);
      setConfig(data);
      setExtraInput((data.extra_recipients || []).join(", "));
    } catch { /* silent */ }
    finally { configFetchRef.current = false; setConfigLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleMail = async () => {
    setTogglingMail(true);
    try {
      const { data } = await axios.put(`${API}/REPORTING-CONFIG/MAIL-STATUS`, { mail_enabled: !mailEnabled });
      setMailEnabled(data.mail_enabled);
      showToast(data.mail_enabled ? "success" : "error",
        data.mail_enabled ? "Mail sending re-enabled." : "Mail sending stopped. No emails will go out.");
    } catch (e) {
      showToast("error", "Could not update mail status.");
    } finally { setTogglingMail(false); }
  };

  const handleToggleTestMode = async () => {
    setTogglingTest(true);
    try {
      const { data } = await axios.put(`${API}/REPORTING-CONFIG/TEST-MODE`, { test_mode: !testMode });
      setTestMode(data.test_mode);
      setTestEmail(data.test_email || "pranjalg.work@gmail.com");
      showToast("success", data.test_mode
        ? `Test Mode ON — all emails → ${data.test_email}`
        : "Test Mode OFF — emails will go to real recipients.");
    } catch (e) {
      showToast("error", "Could not update test mode.");
    } finally { setTogglingTest(false); }
  };

  useEffect(() => { initAll(); }, [initAll]);


  const handleSaveWfhConfig = async () => {
    if (!wfhConfigDraft) return;
    setSavingWfhConfig(true);
    try {
      const { data } = await axios.put(`${API}/WFH-WFO/CONFIG`, wfhConfigDraft);
      setWfhConfig(data);
      setWfhConfigDraft(null);
      showToast("success", "WFH/WFO thresholds saved.");
    } catch (e) {
      showToast("error", "Could not save thresholds.");
    } finally { setSavingWfhConfig(false); }
  };

  const handleAddOffice = async ({ name, lat, lng }) => {
    try {
      const { data } = await axios.post(`${API}/WFH-WFO/OFFICES`, { name, lat: parseFloat(lat), lng: parseFloat(lng) });
      setOffices(data);
      showToast("success", `Office "${name}" added.`);
    } catch (e) { showToast("error", e.response?.data?.detail || "Failed to add office."); }
  };

  const handleUpdateOffice = async (oldName, { name, lat, lng }) => {
    try {
      const { data } = await axios.put(`${API}/WFH-WFO/OFFICES/${encodeURIComponent(oldName)}`, { name, lat: parseFloat(lat), lng: parseFloat(lng) });
      setOffices(data);
      showToast("success", `Office updated.`);
    } catch (e) { showToast("error", e.response?.data?.detail || "Failed to update office."); }
  };

  const handleDeleteOffice = async (name) => {
    if (!window.confirm(`Remove office "${name}"?`)) return;
    try {
      const { data } = await axios.delete(`${API}/WFH-WFO/OFFICES/${encodeURIComponent(name)}`);
      setOffices(data);
      showToast("success", `Office "${name}" removed.`);
    } catch (e) { showToast("error", "Failed to delete office."); }
  };

  const handleSaveExtraRecipients = async () => {
    const emails = extraInput.split(",").map(e => e.trim()).filter(Boolean);
    setSavingConfig(true);
    try {
      await axios.put(`${API}/REPORTING-CONFIG/EXTRA-RECIPIENTS`, { emails });
      await fetchConfig();
      showToast("success", "Extra CC recipients saved.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Save failed.");
    } finally { setSavingConfig(false); }
  };

  const handleSaveHead = async () => {
    if (!headForm.circle || !headForm.head || !headForm.email) {
      showToast("error", "Circle, name and email are required."); return;
    }
    setSavingConfig(true);
    try {
      if (editingHead) {
        await axios.put(`${API}/REPORTING-CONFIG/CIRCLE-HEADS/${encodeURIComponent(editingHead.circle)}`, headForm);
      } else {
        await axios.post(`${API}/REPORTING-CONFIG/CIRCLE-HEADS`, headForm);
      }
      await fetchConfig();
      setEditingHead(null); setShowAddHead(false);
      setHeadForm({ circle:"", head:"", email:"", phone:"" });
      showToast("success", editingHead ? "Circle head updated." : "Circle head added.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Save failed.");
    } finally { setSavingConfig(false); }
  };

  const handleDeleteHead = async (circle) => {
    if (!window.confirm(`Remove circle head for "${circle}"?`)) return;
    setSavingConfig(true);
    try {
      await axios.delete(`${API}/REPORTING-CONFIG/CIRCLE-HEADS/${encodeURIComponent(circle)}`);
      await fetchConfig();
      showToast("success", `Circle head for "${circle}" removed.`);
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Delete failed.");
    } finally { setSavingConfig(false); }
  };

  const handleSaveManager = async () => {
    if (!managerForm.name || !managerForm.email) {
      showToast("error", "Name and email are required."); return;
    }
    setSavingConfig(true);
    try {
      if (editingManager) {
        await axios.put(`${API}/REPORTING-CONFIG/MANAGERS/${encodeURIComponent(editingManager.name)}`, managerForm);
      } else {
        await axios.post(`${API}/REPORTING-CONFIG/MANAGERS`, managerForm);
      }
      await fetchConfig();
      setEditingManager(null); setShowAddManager(false);
      setManagerForm({ name:"", email:"", circle:"" });
      showToast("success", editingManager ? "Manager updated." : "Manager added.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Save failed.");
    } finally { setSavingConfig(false); }
  };

  const handleDeleteManager = async (name) => {
    if (!window.confirm(`Remove manager "${name}"?`)) return;
    setSavingConfig(true);
    try {
      await axios.delete(`${API}/REPORTING-CONFIG/MANAGERS/${encodeURIComponent(name)}`);
      await fetchConfig();
      showToast("success", `Manager "${name}" removed.`);
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Delete failed.");
    } finally { setSavingConfig(false); }
  };

  const handleSaveMgmt = async () => {
    if (!mgmtForm.name || !mgmtForm.email) { showToast("error", "Name and email are required."); return; }
    setSavingConfig(true);
    try {
      await axios.put(`${API}/REPORTING-CONFIG/MANAGEMENT/${encodeURIComponent(editingMgmt.email)}`, { name: mgmtForm.name, email: mgmtForm.email });
      await fetchConfig();
      setEditingMgmt(null);
      showToast("success", "Management member updated.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Failed to update.");
    } finally { setSavingConfig(false); }
  };

  const fetchWfhStatus = async () => {
    try {
      const { data } = await axios.get(`${API}/WFH-WFO/STATUS`);
      const validResults = (data.results || []).filter(r => r.status === "WFH" || r.status === "WFO");
      setWfhStoredAt(data.analyzed_at || null);
      setWfhStoredCount(validResults.length);
    } catch { /* silent */ }
  };

  const handleWfhAnalyze = async (files) => {
    if (!files || !files.length) return;
    setWfhAnalyzing(true);
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append("files", f));
      await axios.post(`${API}/WFH-WFO/ANALYZE`, form);
      await fetchWfhStatus();
      showToast("success", "GPS data processed — WFH/WFO will appear in the next report email.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "WFH/WFO analysis failed.");
    } finally {
      setWfhAnalyzing(false);
    }
  };

  const handleWfhClear = async () => {
    setWfhClearing(true);
    try {
      await axios.delete(`${API}/WFH-WFO/RESULTS`);
      setWfhStoredAt(null);
      setWfhStoredCount(0);
      showToast("success", "GPS data cleared. Next report will not include WFH/WFO.");
    } catch (e) {
      showToast("error", "Failed to clear GPS data.");
    } finally {
      setWfhClearing(false);
    }
  };

  const handleUpload = async (fileType, file) => {
    if (serverOnline !== true) {
      showToast("error", "Backend server is not running. Start uvicorn first.");
      return;
    }
    setUploadingKey(fileType);
    const slot = FILE_SLOTS.find((s) => s.key === fileType);
    const uploadKeys = slot?.combinedKeys || [fileType];
    try {
      await Promise.all(uploadKeys.map(k => {
        const form = new FormData();
        form.append("file_type", k);
        form.append("file", file);
        return axios.post(`${API}/UPLOAD-REPORT-FILE`, form);
      }));
      showToast("success", `${slot?.label || fileType} uploaded successfully.`);
      await fetchStatus();
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Upload failed — please try again.");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Clear all uploaded files? You'll need to re-upload before sending.")) return;
    setClearing(true);
    try {
      await axios.post(`${API}/CLEAR-REPORT-FILES`);
      await fetchStatus();
      showToast("success", "All files cleared. Ready for today's fresh upload.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Clear failed.");
    } finally {
      setClearing(false);
    }
  };

  const handleSend = async () => {
    if (serverOnline !== true) {
      showToast("error", "Backend server is not running. Start uvicorn first.");
      return;
    }
    const required = ["employee_manager", "attendance", "distance", "forms_combined"];
    const notReady = required.filter((k) => {
      const slot = FILE_SLOTS.find(s => s.key === k);
      const keys = slot?.combinedKeys || [k];
      return keys.some(rk => !status[rk]?.uploaded || !isToday(status[rk]?.meta?.uploaded_at));
    });
    if (notReady.length > 0) {
      const labels = notReady.map((k) => FILE_SLOTS.find((s) => s.key === k)?.label || k);
      showToast("error", `Upload today's files for: ${labels.join(", ")}.`);
      return;
    }
    // Date validation — warn if any uploaded file's data date doesn't match report date
    const dateMismatches = FILE_SLOTS
      .filter(s => !s.noDateCheck)
      .filter(s => {
        const key = (s.combinedKeys || [s.key])[0];
        const dd = status[key]?.meta?.data_date;
        return dd && dd !== reportDate;
      })
      .map(s => {
        const key = (s.combinedKeys || [s.key])[0];
        return `${s.label} (data: ${status[key]?.meta?.data_date})`;
      });
    if (dateMismatches.length > 0) {
      const ok = window.confirm(
        `⚠️ Date mismatch detected:\n\n${dateMismatches.join("\n")}\n\nReport date: ${reportDate}\n\nSend anyway?`
      );
      if (!ok) return;
    }
    setLoadingPreview(true);
    try {
      const { data } = await axios.get(`${API}/PREVIEW-RECIPIENTS`);
      setPreviewData(data);
      setShowModal(true);
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Could not load recipient list.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmSend = async () => {
    const extra = modalExtraEmails.split(",").map(e => e.trim()).filter(Boolean);
    setShowModal(false);
    setSending(true);
    try {
      await axios.post(
        `${API}/SEND-DAILY-REPORT?test_mode=${testMode}&report_date=${reportDate}`,
        { extra_recipients: extra },
      );
      showToast(
        "success",
        testMode
          ? `Test reports sent to ${testEmail} only.`
          : "Reports sent to all managers, circle heads and management.",
      );
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Send failed — check backend logs.");
    } finally {
      setSending(false);
      setModalExtraEmails("");
    }
  };

  const TEST_LABELS = {
    management: "Management Email",
    circles:    "Circle Head Emails",
    managers:   "Manager Emails",
  };

  const handleTestSend = async (type) => {
    if (serverOnline !== true) {
      showToast("error", "Backend server is not running. Start uvicorn first.");
      return;
    }
    const requiredFiles = ["employee_manager", "attendance", "distance", "forms_combined"];
    const missing = requiredFiles.filter((k) => {
      const slot = FILE_SLOTS.find(s => s.key === k);
      const keys = slot?.combinedKeys || [k];
      return keys.some(rk => !status[rk]?.uploaded);
    });
    if (missing.length > 0) {
      const labels = missing.map((k) => FILE_SLOTS.find((s) => s.key === k)?.label || k);
      showToast("error", `Upload these files first: ${labels.join(", ")}.`);
      return;
    }
    if (!window.confirm(`Send test "${TEST_LABELS[type]}" to Pranjal only?`)) return;
    setTestSendingType(type);
    try {
      await axios.post(`${API}/SEND-TEST-REPORT/${type}?report_date=${reportDate}`);
      showToast("success", `Test "${TEST_LABELS[type]}" sent to ${testEmail}.`);
    } catch (e) {
      const msg = e.response?.data?.detail || "Test send failed — check backend logs.";
      showToast("error", msg);
    } finally {
      setTestSendingType(null);
    }
  };

  const LIVE_LABELS = {
    management: { label: "Management Team",  desc: "All-circle summary",  recipients: "management recipients" },
    circles:    { label: "Circle Heads",     desc: "One per circle",      recipients: "all circle heads"      },
    managers:   { label: "Managers",         desc: "One per manager",     recipients: "all managers"          },
  };

  const handleLiveSend = async (type) => {
    if (serverOnline !== true) {
      showToast("error", "Backend server is not running. Start uvicorn first.");
      return;
    }
    const requiredFiles = ["employee_manager", "attendance", "distance", "forms_combined"];
    const missing = requiredFiles.filter((k) => {
      const slot = FILE_SLOTS.find(s => s.key === k);
      const keys = slot?.combinedKeys || [k];
      return keys.some(rk => !status[rk]?.uploaded);
    });
    if (missing.length > 0) {
      const labels = missing.map((k) => FILE_SLOTS.find((s) => s.key === k)?.label || k);
      showToast("error", `Upload these files first: ${labels.join(", ")}.`);
      return;
    }
    const info = LIVE_LABELS[type];
    if (!window.confirm(`Send "${info.label}" email to ${info.recipients}?\n\nThis will send real emails to your configured recipients.`)) return;
    setLiveSendingType(type);
    try {
      await axios.post(`${API}/SEND-REPORT/${type}?report_date=${reportDate}`);
      showToast("success", `${info.label} email sent successfully.`);
    } catch (e) {
      const msg = e.response?.data?.detail || "Send failed — check backend logs.";
      showToast("error", msg);
    } finally {
      setLiveSendingType(null);
    }
  };

  const required      = ["employee_manager", "attendance", "distance", "forms_combined"];
  const requiredReady = required.every((k) => {
    const slot = FILE_SLOTS.find(s => s.key === k);
    const keys = slot?.combinedKeys || [k];
    return keys.every(rk => status[rk]?.uploaded && isToday(status[rk]?.meta?.uploaded_at));
  });
  const anyUploaded = Object.values(status).some((v) => v?.uploaded);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── server offline banner ── */}
      {serverOnline === false && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "#1a1a1a", border: "1.5px solid #CC0000",
          borderRadius: 12, padding: "14px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AlertCircle size={18} color="#CC0000" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#fff" }}>
                Backend server is not running
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9ca3af" }}>
                Start it with: <code style={{ background: "#2d2d2d", padding: "1px 7px", borderRadius: 4, color: "#f87171", fontSize: 11.5 }}>
                  uvicorn main:app --reload
                </code>
                {" "}in the <code style={{ background: "#2d2d2d", padding: "1px 7px", borderRadius: 4, color: "#f87171", fontSize: 11.5 }}>excel_validation_api</code> folder
              </p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 8, border: "1px solid #CC0000",
              background: "transparent", color: "#CC0000",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
            }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* ── header ── */}
      <div style={{
        background: "#fff", border: "1px solid #E5E2DC",
        borderRadius: 14, padding: "18px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: T.redLight, border: "1px solid rgba(204,0,0,0.16)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Send size={18} color={T.red} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.black, letterSpacing: "-0.3px" }}>
              Email Reports
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.grey500 }}>
              Upload today's 4 files, then send the daily reports to all managers, circle heads &amp; management
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {anyUploaded && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              style={ghostBtn("#fecaca", "#fff5f5", T.red, clearing)}
            >
              {clearing
                ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                : <Trash2 size={12} />}
              Clear All
            </button>
          )}
          <button onClick={fetchStatus} style={ghostBtn("#E5E2DC", "#FAFAF8", T.grey500, false)}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── info banner ── */}
      {/* ── report date picker ── */}
      <div style={{
        background: "#fff", border: "1px solid #E5E2DC",
        borderRadius: 14, padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Calendar size={16} color="#2563EB" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.black }}>Report Date</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: T.grey500 }}>
              The selected date appears in email subjects, report titles and the Excel file
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <input
            type="date"
            value={reportDate}
            max={todayISO}
            onChange={e => setReportDate(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 9, border: "1.5px solid #BFDBFE",
              fontSize: 13.5, fontWeight: 600, color: "#1e3a8a",
              background: "#EFF6FF", fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer", outline: "none",
            }}
          />
          {reportDate !== todayISO && (
            <button
              onClick={() => setReportDate(todayISO)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "1px solid #D1D5DB",
                background: "#F9FAFB", color: T.grey500, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Reset to Today
            </button>
          )}
          {reportDate !== todayISO && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: "#d97706",
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 20, padding: "3px 10px",
            }}>
              Historical date selected
            </span>
          )}
        </div>
      </div>

      {/* ── file cards grid ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: T.grey500 }}>
          <RefreshCw size={22} color={T.red} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 13 }}>Checking file status…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, width: "100%" }}>
          {FILE_SLOTS.map((slot) => (
            <FileCard
              key={slot.key}
              slot={slot}
              statusData={status}
              onUpload={handleUpload}
              uploadingKey={uploadingKey}
              reportDate={reportDate}
            />
          ))}
          <WfhWfoCard
            wfhAnalyzing={wfhAnalyzing}
            wfhInputRef={wfhInputRef}
            onAnalyze={handleWfhAnalyze}
            onClear={handleWfhClear}
            wfhClearing={wfhClearing}
            wfhStoredAt={wfhStoredAt}
            wfhStoredCount={wfhStoredCount}
            serverOnline={serverOnline}
            wfhConfig={wfhConfig}
            wfhConfigDraft={wfhConfigDraft}
            setWfhConfigDraft={setWfhConfigDraft}
            onSaveWfhConfig={handleSaveWfhConfig}
            savingWfhConfig={savingWfhConfig}
            offices={offices}
            onAddOffice={handleAddOffice}
            onUpdateOffice={handleUpdateOffice}
            onDeleteOffice={handleDeleteOffice}
          />
        </div>
      )}

      {/* ── send reports panel ── */}
      <div style={{ background: "#fff", border: "1px solid #E5E2DC", borderRadius: 14, padding: "18px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: T.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Send size={15} color={T.red} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.black }}>Send Reports</p>
            <p style={{ margin: 0, fontSize: 12, color: T.grey500 }}>Emails go directly to configured recipients</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(LIVE_LABELS).map(([type, info]) => {
            const busy = liveSendingType === type;
            const disabled = !!liveSendingType || sending || serverOnline !== true;
            return (
              <button
                key={type}
                onClick={() => handleLiveSend(type)}
                disabled={disabled}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  gap: 2, padding: "10px 16px", borderRadius: 10,
                  border: `1.5px solid ${T.red}`,
                  background: busy ? T.redLight : "transparent",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled && !busy ? 0.5 : 1,
                  transition: "background .15s",
                  fontFamily: "'DM Sans', sans-serif",
                  minWidth: 170,
                }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = T.redLight; }}
                onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: T.red }}>
                  {busy
                    ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : <Send size={13} />}
                  {busy ? "Sending…" : info.label}
                </span>
                <span style={{ fontSize: 11.5, color: T.grey500, paddingLeft: 20 }}>{info.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── recipients configuration panel ── */}
      <div style={{ background:"#fff", border:"1px solid #E5E2DC", borderRadius:14 }}>
        {/* header / toggle */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 24px" }}>
          <button
            onClick={() => { setShowConfigPanel(p => !p); if (!config) fetchConfig(); }}
            style={{ display:"flex", alignItems:"center", gap:10, border:"none", background:"transparent",
              cursor:"pointer", fontFamily:"'DM Sans',sans-serif", padding:0 }}
          >
            <div style={{ width:32, height:32, borderRadius:8, background:T.redLight,
              border:"1px solid rgba(204,0,0,0.16)", display:"flex", alignItems:"center",
              justifyContent:"center", flexShrink:0 }}>
              <Info size={15} color={T.red} />
            </div>
            <div style={{ textAlign:"left" }}>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:T.black }}>Recipients Configuration</p>
              <p style={{ margin:"2px 0 0", fontSize:12, color:T.grey500 }}>
                Manage circle heads, managers and extra CC addresses
              </p>
            </div>
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            {/* Test Mode toggle */}
            <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", userSelect:"none" }}>
              <div onClick={handleToggleTestMode} style={{
                width:36, height:20, borderRadius:20,
                background: testMode ? T.amber : "#D1D5DB",
                position:"relative", transition:"background .2s", cursor:"pointer", flexShrink:0,
              }}>
                <div style={{
                  position:"absolute", top:2, left: testMode ? 18 : 2,
                  width:16, height:16, borderRadius:"50%",
                  background:"#fff", transition:"left .2s",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
              <span style={{ fontSize:12, fontWeight:600, color: testMode ? T.amber : T.grey500, whiteSpace:"nowrap" }}>
                {testMode ? "Test Mode ON" : "Test Mode"}
              </span>
            </label>
            <button onClick={() => { setShowConfigPanel(p => !p); if (!config) fetchConfig(); }}
              style={{ border:"none", background:"transparent", cursor:"pointer", fontSize:18, color:T.grey500, fontWeight:300, padding:"0 4px" }}>
              {showConfigPanel ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {showConfigPanel && !config && configLoading && (
          <div style={{ padding:"16px 24px 20px", display:"flex", alignItems:"center", gap:10, color:T.grey500, fontSize:13 }}>
            <RefreshCw size={14} style={{ animation:"spin 1s linear infinite" }} />
            Loading configuration…
          </div>
        )}
        {showConfigPanel && !config && !configLoading && (
          <div style={{ padding:"16px 24px 20px", display:"flex", alignItems:"center", gap:10, color:T.grey500, fontSize:13 }}>
            <AlertCircle size={14} color={T.red} />
            {serverOnline === true ? "Could not load config — try refreshing." : "Backend is offline — start the server to load config."}
          </div>
        )}
        {showConfigPanel && config && (
          <div style={{ padding:"0 24px 24px", display:"flex", flexDirection:"column", gap:20 }}>

            {/* ── management table ── */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:T.black }}>Management</p>
                <button
                  onClick={() => { setShowAddMgmt(true); setEditingMgmt(null); setHeadForm({ circle:"", head:"", email:"", phone:"" }); }}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8,
                    border:`1px solid ${T.red}`, background:T.redLight, color:T.red,
                    fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                >+ Add Member</button>
              </div>

              <div style={{ border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
                {/* table header */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr auto",
                  background:"#F9FAFB", padding:"9px 14px", gap:12,
                  fontSize:10.5, fontWeight:700, color:T.grey500, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                  <span>Name</span><span>Email</span><span>Actions</span>
                </div>
                {(config.management_recipients || []).map((m, i) => (
                  <div key={m.email || i} style={{
                    display:"grid", gridTemplateColumns:"1fr 1.5fr auto",
                    padding:"10px 14px", gap:12, alignItems:"center",
                    borderTop: i===0 ? "none" : "1px solid #F3F4F6",
                    background: editingMgmt?.email === m.email ? "#FFF8F8" : "#fff",
                  }}>
                    {editingMgmt?.email === m.email ? (
                      <>
                        <input value={mgmtForm.name} onChange={e => setMgmtForm(f => ({ ...f, name: e.target.value }))}
                          style={inputStyle} placeholder="Name" />
                        <input value={mgmtForm.email} onChange={e => setMgmtForm(f => ({ ...f, email: e.target.value }))}
                          style={inputStyle} placeholder="Email" type="email" />
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={handleSaveMgmt} disabled={savingConfig}
                            style={actionBtn(T.red, T.redLight)}>Save</button>
                          <button onClick={() => setEditingMgmt(null)} style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:T.black }}>{m.name}</span>
                        <span style={{ fontSize:12.5, color:T.grey500, wordBreak:"break-all" }}>{m.email}</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={() => { setEditingMgmt(m); setMgmtForm({ name: m.name, email: m.email }); setShowAddMgmt(false); }}
                            style={actionBtn("#0369a1","rgba(3,105,161,0.07)")}>Edit</button>
                          <button onClick={async () => {
                            if (window.confirm(`Remove ${m.name} from management?`)) {
                              try {
                                await axios.delete(`${API}/REPORTING-CONFIG/MANAGEMENT/${encodeURIComponent(m.email)}`);
                                await fetchConfig();
                                showToast("success", `${m.name} removed from management.`);
                              } catch (e) {
                                showToast("error", "Failed to remove.");
                              }
                            }
                          }} style={actionBtn(T.red, T.redLight)}>Del</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* inline add row */}
                {showAddMgmt && (
                  <div style={{
                    display:"grid", gridTemplateColumns:"1fr 1.5fr auto",
                    padding:"10px 14px", gap:8, alignItems:"center",
                    borderTop:"1px solid #F3F4F6", background:"#FFF8F8",
                  }}>
                    <input type="text" placeholder="Name"
                      value={headForm.head}
                      onChange={e => setHeadForm(f => ({ ...f, head: e.target.value }))}
                      style={inputStyle} />
                    <input type="email" placeholder="Email"
                      value={headForm.email}
                      onChange={e => setHeadForm(f => ({ ...f, email: e.target.value }))}
                      style={inputStyle} />
                    <div style={{ display:"flex", gap:6 }}>
                      <button
                        onClick={async () => {
                          if (!headForm.head || !headForm.email) { showToast("error", "Name and email are required."); return; }
                          setSavingConfig(true);
                          try {
                            await axios.post(`${API}/REPORTING-CONFIG/MANAGEMENT`, { name: headForm.head, email: headForm.email });
                            await fetchConfig();
                            setHeadForm({ circle:"", head:"", email:"", phone:"" });
                            setShowAddMgmt(false);
                            showToast("success", "Management member added.");
                          } catch (e) {
                            showToast("error", e.response?.data?.detail || "Failed to add.");
                          } finally { setSavingConfig(false); }
                        }}
                        disabled={savingConfig}
                        style={actionBtn(T.red, T.redLight)}>Save</button>
                      <button onClick={() => { setShowAddMgmt(false); setHeadForm({ circle:"", head:"", email:"", phone:"" }); }}
                        style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                    </div>
                  </div>
                )}

                {(config.management_recipients || []).length === 0 && !showAddMgmt && (
                  <div style={{ padding:"10px 14px", fontSize:12, color:T.grey500, textAlign:"center" }}>
                    No management members configured
                  </div>
                )}
              </div>
            </div>

            {/* ── circle heads table ── */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:T.black }}>Circle Heads</p>
                <button
                  onClick={() => { setShowAddHead(true); setEditingHead(null); setHeadForm({ circle:"", head:"", email:"", phone:"" }); }}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8,
                    border:`1px solid ${T.red}`, background:T.redLight, color:T.red,
                    fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                >+ Add Circle Head</button>
              </div>

              <div style={{ border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
                {/* table header */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.5fr auto",
                  background:"#F9FAFB", padding:"9px 14px", gap:12,
                  fontSize:10.5, fontWeight:700, color:T.grey500, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                  <span>Circle</span><span>Head Name</span><span>Email</span><span>Actions</span>
                </div>
                {(config.circle_heads || []).map((ch, i) => (
                  <div key={ch.circle} style={{
                    display:"grid", gridTemplateColumns:"1fr 1fr 1.5fr auto",
                    padding:"10px 14px", gap:12, alignItems:"center",
                    borderTop: i===0 ? "none" : "1px solid #F3F4F6",
                    background: editingHead?.circle === ch.circle ? "#FFF8F8" : "#fff",
                  }}>
                    {editingHead?.circle === ch.circle ? (
                      <>
                        <input value={headForm.circle} onChange={e=>setHeadForm(f=>({...f,circle:e.target.value}))}
                          style={inputStyle} placeholder="Circle" />
                        <input value={headForm.head} onChange={e=>setHeadForm(f=>({...f,head:e.target.value}))}
                          style={inputStyle} placeholder="Head name" />
                        <input value={headForm.email} onChange={e=>setHeadForm(f=>({...f,email:e.target.value}))}
                          style={inputStyle} placeholder="Email" />
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={handleSaveHead} disabled={savingConfig}
                            style={actionBtn(T.red, T.redLight)}>Save</button>
                          <button onClick={()=>setEditingHead(null)} style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:T.black }}>{ch.circle}</span>
                        <span style={{ fontSize:13, color:T.black }}>{ch.head}</span>
                        <span style={{ fontSize:12.5, color:T.grey500, wordBreak:"break-all" }}>{ch.email}</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={()=>{ setEditingHead(ch); setHeadForm({...ch}); setShowAddHead(false); }}
                            style={actionBtn("#0369a1","rgba(3,105,161,0.07)")}>Edit</button>
                          <button onClick={()=>handleDeleteHead(ch.circle)} disabled={savingConfig}
                            style={actionBtn(T.red, T.redLight)}>Del</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* add new row */}
                {showAddHead && (
                  <div style={{
                    display:"grid", gridTemplateColumns:"1fr 1fr 1.5fr auto",
                    padding:"10px 14px", gap:12, alignItems:"center",
                    borderTop:"1px solid #F3F4F6", background:"#F0FDF4",
                  }}>
                    <input value={headForm.circle} onChange={e=>setHeadForm(f=>({...f,circle:e.target.value}))}
                      style={inputStyle} placeholder="Circle name" />
                    <input value={headForm.head} onChange={e=>setHeadForm(f=>({...f,head:e.target.value}))}
                      style={inputStyle} placeholder="Head name" />
                    <input value={headForm.email} onChange={e=>setHeadForm(f=>({...f,email:e.target.value}))}
                      style={inputStyle} placeholder="email@company.com" />
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={handleSaveHead} disabled={savingConfig}
                        style={actionBtn(T.green,"#f0fdf4")}>Add</button>
                      <button onClick={()=>setShowAddHead(false)} style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── managers table ── */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:T.black }}>Managers</p>
                <button
                  onClick={() => { setShowAddManager(true); setEditingManager(null); setManagerForm({ name:"", email:"", circle:"" }); }}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8,
                    border:"1px solid #0369a1", background:"rgba(3,105,161,0.07)", color:"#0369a1",
                    fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                >+ Add Manager</button>
              </div>

              <div style={{ border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1.5fr 1fr auto",
                  background:"#F9FAFB", padding:"9px 14px", gap:12,
                  fontSize:10.5, fontWeight:700, color:T.grey500, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                  <span>Name</span><span>Email</span><span>Circle</span><span>Actions</span>
                </div>

                {(config.managers || []).length === 0 && !showAddManager && (
                  <div style={{ padding:"16px 14px", fontSize:12.5, color:T.grey500, textAlign:"center" }}>
                    No managers added yet. Click "+ Add Manager" to add one.
                  </div>
                )}

                {(config.managers || []).map((m, i) => (
                  <div key={m.name} style={{
                    display:"grid", gridTemplateColumns:"1.2fr 1.5fr 1fr auto",
                    padding:"10px 14px", gap:12, alignItems:"center",
                    borderTop: i===0 ? "none" : "1px solid #F3F4F6",
                    background: editingManager?.name === m.name ? "#F0F7FF" : "#fff",
                  }}>
                    {editingManager?.name === m.name ? (
                      <>
                        <input value={managerForm.name} onChange={e=>setManagerForm(f=>({...f,name:e.target.value}))}
                          style={inputStyle} placeholder="Manager name" />
                        <input value={managerForm.email} onChange={e=>setManagerForm(f=>({...f,email:e.target.value}))}
                          style={inputStyle} placeholder="Email" />
                        <input value={managerForm.circle} onChange={e=>setManagerForm(f=>({...f,circle:e.target.value}))}
                          style={inputStyle} placeholder="Circle" />
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={handleSaveManager} disabled={savingConfig}
                            style={actionBtn("#0369a1","rgba(3,105,161,0.07)")}>Save</button>
                          <button onClick={()=>setEditingManager(null)} style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:T.black }}>{m.name}</span>
                        <span style={{ fontSize:12.5, color:T.grey500, wordBreak:"break-all" }}>{m.email}</span>
                        <span style={{ fontSize:12.5, color:T.grey500 }}>{m.circle || "—"}</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={()=>{ setEditingManager(m); setManagerForm({...m}); setShowAddManager(false); }}
                            style={actionBtn("#0369a1","rgba(3,105,161,0.07)")}>Edit</button>
                          <button onClick={()=>handleDeleteManager(m.name)} disabled={savingConfig}
                            style={actionBtn(T.red, T.redLight)}>Del</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {showAddManager && (
                  <div style={{
                    display:"grid", gridTemplateColumns:"1.2fr 1.5fr 1fr auto",
                    padding:"10px 14px", gap:12, alignItems:"center",
                    borderTop:"1px solid #F3F4F6", background:"#EFF6FF",
                  }}>
                    <input value={managerForm.name} onChange={e=>setManagerForm(f=>({...f,name:e.target.value}))}
                      style={inputStyle} placeholder="Manager name" />
                    <input value={managerForm.email} onChange={e=>setManagerForm(f=>({...f,email:e.target.value}))}
                      style={inputStyle} placeholder="email@company.com" />
                    <input value={managerForm.circle} onChange={e=>setManagerForm(f=>({...f,circle:e.target.value}))}
                      style={inputStyle} placeholder="Circle (optional)" />
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={handleSaveManager} disabled={savingConfig}
                        style={actionBtn("#0369a1","rgba(3,105,161,0.07)")}>Add</button>
                      <button onClick={()=>setShowAddManager(false)} style={actionBtn(T.grey500,"#F3F4F6")}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── persistent extra CC ── */}
            <div>
              <p style={{ margin:"0 0 8px", fontSize:13.5, fontWeight:700, color:T.black }}>
                Always CC (all reports)
              </p>
              <p style={{ margin:"0 0 10px", fontSize:12, color:T.grey500 }}>
                These addresses receive every report in addition to the primary recipients.
              </p>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  type="text"
                  value={extraInput}
                  onChange={e => setExtraInput(e.target.value)}
                  placeholder="email1@co.com, email2@co.com"
                  style={{ ...inputStyle, flex:1 }}
                />
                <button onClick={handleSaveExtraRecipients} disabled={savingConfig}
                  style={{
                    padding:"8px 18px", borderRadius:8, border:"none",
                    background:T.red, color:"#fff", fontSize:13, fontWeight:600,
                    cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0,
                  }}>
                  {savingConfig ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── mail kill switch ── */}
      <div style={{
        background: mailEnabled ? "#fff" : "#1a1a1a",
        border: `1.5px solid ${mailEnabled ? "#E5E2DC" : "#CC0000"}`,
        borderRadius: 14, padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        transition: "background .3s, border-color .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: mailEnabled ? T.redLight : "rgba(204,0,0,0.15)",
            border: `1px solid ${mailEnabled ? "rgba(204,0,0,0.16)" : "rgba(204,0,0,0.4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Send size={16} color={T.red} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: mailEnabled ? T.black : "#fff" }}>
              {mailEnabled ? "Mail sending is active" : "Mail sending is STOPPED"}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: mailEnabled ? T.grey500 : "#9ca3af" }}>
              {mailEnabled
                ? "Reports will go out to real recipients when sent."
                : "All email sends are blocked — no mails will go out, including the scheduler."}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleMail}
          disabled={togglingMail}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: mailEnabled ? T.red : "#16a34a",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: togglingMail ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
            opacity: togglingMail ? 0.7 : 1,
            transition: "background .2s",
            boxShadow: mailEnabled ? "0 2px 10px rgba(204,0,0,0.3)" : "0 2px 10px rgba(22,163,74,0.3)",
          }}
        >
          {togglingMail
            ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
            : mailEnabled ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
          {togglingMail ? "Updating…" : mailEnabled ? "Stop Sending Mails" : "Re-enable Sending"}
        </button>
      </div>

      {/* ── send bar ── */}
      <div style={{
        background: testMode ? "#fffbeb" : "#fff",
        border: `1px solid ${testMode ? "#fde68a" : "#E5E2DC"}`,
        borderRadius: 14, padding: "18px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        transition: "background .2s, border-color .2s",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.black }}>
              {requiredReady ? "All files ready — dispatch reports" : "Waiting for today's files…"}
            </p>
            {/* Test Mode toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
              <div
                onClick={() => setTestMode(m => !m)}
                style={{
                  width: 36, height: 20, borderRadius: 20,
                  background: testMode ? T.amber : "#D1D5DB",
                  position: "relative", transition: "background .2s", cursor: "pointer",
                }}
              >
                <div style={{
                  position: "absolute", top: 2,
                  left: testMode ? 18 : 2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left .2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: testMode ? T.amber : T.grey500 }}>
                {testMode ? "Test Mode ON" : "Test Mode"}
              </span>
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: testMode ? "#92400e" : T.grey500 }}>
            {testMode
              ? `Emails will go to ${testEmail} only — not real recipients.`
              : requiredReady
                ? "Emails will go out to all managers, circle heads and the management team."
                : "All 4 required files must be uploaded today before you can send."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* readiness dots */}
          <div style={{ display: "flex", gap: 5 }}>
            {required.map((k) => {
              const slot  = FILE_SLOTS.find(s => s.key === k);
              const keys  = slot?.combinedKeys || [k];
              const ok    = keys.every(rk => status[rk]?.uploaded && isToday(status[rk]?.meta?.uploaded_at));
              const stale = !ok && keys.some(rk => status[rk]?.uploaded);
              return (
                <div
                  key={k}
                  title={slot?.label || k}
                  style={{
                    width: 9, height: 9, borderRadius: "50%",
                    background: ok ? T.green : stale ? T.amber : "#D1D5DB",
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={handleSend}
            disabled={!requiredReady || sending || loadingPreview || !mailEnabled || serverOnline !== true}
            title={
              serverOnline !== true ? "Backend server is not running" :
              !mailEnabled          ? "Mail sending is disabled — use the kill switch above to re-enable" : ""
            }
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 9, border: "none",
              background: requiredReady && !sending && !loadingPreview && mailEnabled && serverOnline === true ? T.red : "#D1D5DB",
              color: "#fff", fontSize: 13.5, fontWeight: 700,
              cursor: requiredReady && !sending && !loadingPreview && mailEnabled && serverOnline === true ? "pointer" : "not-allowed",
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: requiredReady && !sending && !loadingPreview && mailEnabled && serverOnline === true ? "0 2px 10px rgba(204,0,0,0.3)" : "none",
              transition: "background .15s",
            }}
            onMouseEnter={(e) => { if (requiredReady && !sending && !loadingPreview && mailEnabled && serverOnline === true) e.currentTarget.style.background = T.redDark; }}
            onMouseLeave={(e) => { if (requiredReady && !sending && !loadingPreview && mailEnabled && serverOnline === true) e.currentTarget.style.background = T.red; }}
          >
            {(sending || loadingPreview)
              ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
              : <Send size={15} />}
            {sending ? "Sending…" : loadingPreview ? "Loading…" : "Send Reports Now"}
          </button>
        </div>
      </div>

      {/* ── recipient preview modal ── */}
      {showModal && previewData && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16,
            width: "100%", maxWidth: 560,
            height: "min(720px, 90vh)", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}>
            {/* modal header */}
            <div style={{
              padding: "20px 24px 18px",
              borderBottom: "1px solid #F0F0F0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.black, letterSpacing: "-0.3px" }}>
                  Confirm Email Dispatch
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: T.grey500 }}>
                  Review recipients before sending — fetched live from your uploaded files
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  width: 30, height: 30, borderRadius: "50%", border: "none",
                  background: "#F3F4F6", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, color: T.grey500, fontWeight: 700, marginLeft: 12,
                }}
              >×</button>
            </div>

            {/* recipient sections — flex:1 + minHeight:0 makes this area scroll */}
            <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "management", label: "Management",   color: "#7C3AED", bg: "rgba(124,58,237,0.07)" },
                { key: "circles",    label: "Circle Heads", color: T.red,     bg: T.redLight             },
                { key: "managers",   label: "Managers",     color: "#0369a1", bg: "rgba(3,105,161,0.07)"  },
              ].map(({ key, label, color, bg }) => {
                const list = previewData[key] || [];
                return (
                  <div key={key} style={{ border: "1px solid #EEEEEE", borderRadius: 10, overflow: "hidden" }}>
                    {/* section header */}
                    <div style={{
                      background: bg, padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
                      <span style={{
                        background: color, color: "#fff",
                        fontSize: 10, fontWeight: 700, borderRadius: 20,
                        padding: "1px 8px", letterSpacing: "0.3px",
                      }}>{list.length}</span>
                    </div>
                    {/* recipient rows */}
                    {list.length === 0 ? (
                      <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: T.grey500 }}>
                        No recipients found in uploaded file.
                      </p>
                    ) : (
                      list.map((r, i) => (
                        <div key={i} style={{
                          padding: "9px 14px",
                          borderTop: i === 0 ? "none" : "1px solid #F5F5F5",
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.black }}>
                              {r.head || r.name}
                              {r.circle && <span style={{ fontWeight: 400, color: T.grey500, marginLeft: 6 }}>
                                — {r.circle}
                              </span>}
                            </p>
                          </div>
                          <p style={{ margin: 0, fontSize: 11.5, color: T.grey500, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {r.email || "—"}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>

            {/* extra CC emails for this send only */}
            <div style={{ padding: "12px 24px 0", borderTop: "1px solid #F5F5F5" }}>
              <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 600, color: T.grey500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Extra CC for this send (optional)
              </p>
              <input
                type="text"
                placeholder="email1@company.com, email2@company.com"
                value={modalExtraEmails}
                onChange={e => setModalExtraEmails(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid #E5E7EB", fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif", color: T.black,
                  outline: "none",
                }}
              />
            </div>

            {/* modal footer */}
            <div style={{ padding: "14px 24px 18px", borderTop: "1px solid #F0F0F0" }}>
              {testMode && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#fffbeb", border: "1px solid #fde68a",
                  borderRadius: 8, padding: "9px 12px", marginBottom: 12,
                  fontSize: 12, color: "#92400e",
                }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Test Mode is ON</strong> — emails will go to
                    <strong> {testEmail}</strong> only, not the real recipients above.
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "9px 20px", borderRadius: 8, border: "1px solid #E5E7EB",
                    background: "#fff", color: T.grey500, fontSize: 13.5, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSend}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 22px", borderRadius: 8, border: "none",
                    background: testMode ? T.amber : T.red,
                    color: "#fff", fontSize: 13.5, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    boxShadow: testMode ? "0 2px 10px rgba(217,119,6,0.3)" : "0 2px 10px rgba(204,0,0,0.3)",
                  }}
                >
                  <Send size={14} />
                  {testMode ? "Send to Test Address" : "Confirm & Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "#fff",
          border: `1.5px solid ${toast.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.13)",
          padding: "13px 16px", maxWidth: 380,
          fontSize: 13, color: T.black,
          animation: "fadeInUp .2s ease",
        }}>
          {toast.type === "success"
            ? <CheckCircle size={15} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} />
            : <AlertCircle size={15} color={T.red}   style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <style>{`
        @keyframes spin     { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

const tinyInput = {
  padding: "3px 6px", borderRadius: 5, border: "1px solid #E2E8F0",
  fontSize: 10.5, fontFamily: "'DM Sans', sans-serif", color: "#111",
  outline: "none", width: "100%", boxSizing: "border-box",
};

const inputStyle = {
  padding: "7px 10px", borderRadius: 7, border: "1px solid #E5E7EB",
  fontSize: 12.5, fontFamily: "'DM Sans', sans-serif", color: "#111",
  outline: "none", width: "100%", boxSizing: "border-box",
};

function actionBtn(color, bg) {
  return {
    padding: "5px 11px", borderRadius: 6, border: `1px solid ${color}`,
    background: bg, color, fontSize: 11.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
  };
}

function ghostBtn(borderColor, bg, color, disabled) {
  return {
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 8,
    border: `1px solid ${borderColor}`, background: bg, color,
    fontSize: 12.5, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'DM Sans', sans-serif",
    opacity: disabled ? 0.6 : 1,
  };
}
