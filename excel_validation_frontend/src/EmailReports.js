import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Upload, CheckCircle, AlertCircle, Clock, Send,
  FileSpreadsheet, FileText, RefreshCw, Info,
  Trash2, AlertTriangle, Calendar, Settings,
} from "lucide-react";

const API = "http://127.0.0.1:8000";

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
    label:       "Employee & Manager Details",
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
  },
  {
    key:         "alarm",
    label:       "Alarm / Sites Down",
    description: "Site outage data — Global ID, Site Name, State / Circle",
    accept:      "*",
    icon:        FileText,
    freq:        "Daily (optional)",
    optional:    true,
  },
  {
    key:         "active_sites",
    label:       "Active Sites Report",
    description: "Active site list — State/Circle, Site ID, Site Name (one row per site)",
    accept:      "*",
    icon:        FileText,
    freq:        "Daily (optional)",
    optional:    true,
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
  const [drag, setDrag] = useState(false);

  // For combined slots, derive status from all constituent keys
  const keys     = slot.combinedKeys || [slot.key];
  const infos    = keys.map(k => statusData[k] || {});
  const info     = infos[0]; // use first key for filename/size display
  const meta     = info.meta;
  const uploaded = infos.every(i => i.uploaded && !!i.meta);
  const fresh    = uploaded && infos.every(i => isToday(i.meta?.uploaded_at));
  const stale    = infos.some(i => i.uploaded && !!i.meta) && !fresh;
  const busy     = uploadingKey === slot.key;
  const Icon     = slot.icon;

  // Date validation — skip for master-data slots
  const skipDateCheck = slot.noDateCheck;
  const dataDate      = meta?.data_date || null;
  const dateMismatch  = !skipDateCheck && uploaded && dataDate && reportDate && dataDate !== reportDate;

  const pick = (file) => { if (file) onUpload(slot.key, file); };

  // colours — date mismatch overrides green with amber
  let border = "#D1D5DB", bg = "#FAFAFA";
  if (drag)            { border = T.red;   bg = T.redLight;  }
  else if (dateMismatch) { border = T.amber; bg = T.amberBg; }
  else if (fresh)      { border = T.green; bg = T.greenBg;   }
  else if (stale)      { border = T.amber; bg = T.amberBg;   }

  return (
    <div style={{
      border: `1.5px solid ${border}`,
      borderRadius: 12,
      background: bg,
      padding: "18px 18px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition: "border-color .18s, background .18s",
    }}>

      {/* — top row — */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>

        {/* icon box */}
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: fresh ? T.greenBg : stale ? T.amberBg : T.redLight,
          border: `1px solid ${fresh ? "#bbf7d0" : stale ? "#fde68a" : "rgba(204,0,0,0.16)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} color={fresh ? T.green : stale ? T.amber : T.red} />
        </div>

        {/* labels */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.black }}>
              {slot.label}
            </p>
            {slot.optional && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: T.amber,
                background: T.amberBg, border: "1px solid #fde68a",
                borderRadius: 20, padding: "1px 8px",
              }}>
                Optional
              </span>
            )}
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.grey500, lineHeight: 1.4 }}>
            {slot.description}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF" }}>
            Frequency: {slot.freq}
          </p>
        </div>

        {/* status badge */}
        {fresh ? (
          <span style={badge(T.green, T.greenBg, "#bbf7d0")}>
            <CheckCircle size={10} /> Ready
          </span>
        ) : stale ? (
          <span style={badge(T.amber, T.amberBg, "#fde68a")}>
            <AlertTriangle size={10} /> Outdated
          </span>
        ) : (
          <span style={badge(T.grey500, "#F3F4F6", "#E5E7EB")}>
            <Clock size={10} /> Pending
          </span>
        )}
      </div>

      {/* — stale warning — */}
      {stale && !dateMismatch && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 7, padding: "7px 10px",
          fontSize: 11.5, color: "#92400e",
        }}>
          <AlertTriangle size={11} style={{ flexShrink: 0 }} />
          Uploaded <strong style={{ margin: "0 3px" }}>{relLabel(meta?.uploaded_at)}</strong>
          — please re-upload today's file.
        </div>
      )}

      {/* — date mismatch warning — */}
      {dateMismatch && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 7, padding: "7px 10px",
          fontSize: 11.5, color: "#92400e",
        }}>
          <AlertTriangle size={11} style={{ flexShrink: 0 }} />
          Data date is <strong style={{ margin: "0 3px" }}>{dataDate}</strong>
          but report date is <strong style={{ margin: "0 3px" }}>{reportDate}</strong> — please re-upload the correct file.
        </div>
      )}

      {/* — file meta (fresh only) — */}
      {uploaded && meta && (
        <div style={{
          fontSize: 11.5, color: T.grey500,
          background: "#F9FAFB", borderRadius: 7,
          padding: "6px 10px", lineHeight: 1.7,
        }}>
          <strong style={{ color: T.black }}>{meta.original_name}</strong>
          {" · "}{fmtTime(meta.uploaded_at)}
          {" · "}{(meta.size_bytes / 1024).toFixed(1)} KB
          {dataDate && !skipDateCheck && (
            <span style={{ marginLeft: 6, color: dateMismatch ? "#b45309" : "#059669", fontWeight: 600 }}>
              · Data: {dataDate}
            </span>
          )}
        </div>
      )}

      {/* — drop zone — */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? T.red : "#D1D5DB"}`,
          borderRadius: 8, padding: "16px 12px",
          textAlign: "center",
          cursor: busy ? "not-allowed" : "pointer",
          background: drag ? T.redLight : "transparent",
          transition: "all .15s",
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy
          ? <RefreshCw size={18} color={T.red}   style={{ marginBottom: 5, animation: "spin 1s linear infinite" }} />
          : <Upload    size={18} color={drag ? T.red : T.grey500} style={{ marginBottom: 5 }} />
        }
        <p style={{ margin: 0, fontSize: 12.5, color: busy ? T.red : T.grey500 }}>
          {busy
            ? "Uploading…"
            : (fresh || stale)
              ? "Drop a new file to replace"
              : "Click or drag & drop to upload"}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9CA3AF" }}>
          {slot.accept === "*" ? "CSV, XLSX, XLS" : slot.accept.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={slot.accept}
        style={{ display: "none" }}
        onChange={(e) => pick(e.target.files[0])}
      />
    </div>
  );
}

function badge(color, bg, borderColor) {
  return {
    display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
    fontSize: 10.5, fontWeight: 600, color,
    background: bg, border: `1px solid ${borderColor}`,
    borderRadius: 20, padding: "3px 9px",
    whiteSpace: "nowrap",
  };
}

// ── WFH / WFO card (fits inside the 3-column file grid) ──────────────

function WfhWfoCard({ wfhAnalyzing, wfhInputRef, onAnalyze, onClear, wfhClearing, wfhStoredAt, wfhStoredCount, serverOnline, wfhConfig, wfhConfigDraft, setWfhConfigDraft, onSaveWfhConfig, savingWfhConfig }) {
  const [drag, setDrag] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const draft = wfhConfigDraft || wfhConfig;
  const isDirty = wfhConfigDraft !== null;

  const hasSaved = !!wfhStoredAt;
  let border = "#D1D5DB", bg = "#FAFAFA";
  if (drag)           { border = "#059669"; bg = "rgba(5,150,105,0.06)"; }
  else if (wfhAnalyzing) { border = "#059669"; bg = "rgba(5,150,105,0.04)"; }
  else if (hasSaved)  { border = T.green;   bg = T.greenBg; }

  const addFiles = (files) => {
    const csvs = Array.from(files).filter(f => f.name.endsWith(".csv"));
    if (csvs.length && serverOnline === true) onAnalyze(csvs);
  };

  return (
    <div style={{
      border: `1.5px solid ${border}`,
      borderRadius: 12,
      background: bg,
      padding: "18px 18px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition: "border-color .18s, background .18s",
    }}>

      {/* — top row — */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: hasSaved ? T.greenBg : "rgba(5,150,105,0.08)",
          border: `1px solid ${hasSaved ? "#bbf7d0" : "rgba(5,150,105,0.18)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {wfhAnalyzing
            ? <RefreshCw size={15} color="#059669" style={{ animation: "spin 1s linear infinite" }} />
            : <FileText size={16} color={hasSaved ? T.green : "#059669"} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.black }}>
              WFH / WFO
            </p>
            <span style={{
              fontSize: 10, fontWeight: 600, color: "#059669",
              background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.18)",
              borderRadius: 20, padding: "1px 8px",
            }}>Optional</span>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.grey500, lineHeight: 1.4 }}>
            Drop GPS tracking CSVs — auto-included in the report email
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF" }}>Frequency: As needed</p>
        </div>

        {wfhAnalyzing ? (
          <span style={badge("#059669", "rgba(5,150,105,0.08)", "rgba(5,150,105,0.25)")}><RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} /> Processing</span>
        ) : hasSaved ? (
          <span style={badge(T.green, T.greenBg, "#bbf7d0")}><CheckCircle size={10} /> Ready</span>
        ) : (
          <span style={badge(T.grey500, "#F3F4F6", "#E5E7EB")}><Clock size={10} /> Optional</span>
        )}
      </div>

      {/* — drop zone — auto-analyzes on drop/select — */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => !wfhAnalyzing && wfhInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? "#059669" : "#D1D5DB"}`,
          borderRadius: 8, padding: "18px 12px",
          textAlign: "center",
          cursor: wfhAnalyzing ? "not-allowed" : "pointer",
          background: drag ? "rgba(5,150,105,0.04)" : "transparent",
          transition: "all .15s",
          opacity: wfhAnalyzing ? 0.65 : 1,
        }}
      >
        {wfhAnalyzing
          ? <RefreshCw size={18} color="#059669" style={{ marginBottom: 5, animation: "spin 1s linear infinite" }} />
          : <Upload size={18} color={drag ? "#059669" : T.grey500} style={{ marginBottom: 5 }} />
        }
        <p style={{ margin: 0, fontSize: 12.5, color: wfhAnalyzing ? "#059669" : T.grey500 }}>
          {wfhAnalyzing ? "Analyzing GPS data…" : "Click or drag & drop tracking CSVs"}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9CA3AF" }}>
          {wfhAnalyzing ? "Results will appear in the report email" : "Multiple files accepted — one per employee"}
        </p>
        <input
          ref={wfhInputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: "none" }}
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* — saved status + clear — */}
      {hasSaved && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.22)",
          borderRadius: 7, padding: "8px 10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <CheckCircle size={12} color="#059669" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "#065f46", fontWeight: 700 }}>
              {wfhStoredCount} employee{wfhStoredCount !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: 11, color: "#6B7280" }}>included in next report</span>
          </div>
          <button
            onClick={onClear}
            disabled={wfhClearing}
            style={{ ...actionBtn(T.red, "#fef2f2"), fontSize: 11, padding: "3px 9px", flexShrink: 0 }}
          >
            {wfhClearing ? "…" : "Clear"}
          </button>
        </div>
      )}

      {/* — thresholds settings — */}
      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 8 }}>
        <button
          onClick={() => setShowSettings(s => !s)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 11, color: T.grey500, display: "flex", alignItems: "center", gap: 4 }}
        >
          <Settings size={11} /> Thresholds {showSettings ? "▲" : "▼"}
        </button>

        {showSettings && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1, fontSize: 11, color: T.grey500 }}>
                WFO radius (km)
                <input
                  type="number" min="0.1" step="0.1"
                  value={draft.wfo_radius_km}
                  onChange={e => setWfhConfigDraft({ ...draft, wfo_radius_km: parseFloat(e.target.value) || 2.0 })}
                  style={{ display: "block", width: "100%", marginTop: 3,
                    border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px",
                    fontSize: 12, outline: "none" }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 11, color: T.grey500 }}>
                WFH travel (km)
                <input
                  type="number" min="0.1" step="0.1"
                  value={draft.wfh_travel_km}
                  onChange={e => setWfhConfigDraft({ ...draft, wfh_travel_km: parseFloat(e.target.value) || 2.0 })}
                  style={{ display: "block", width: "100%", marginTop: 3,
                    border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px",
                    fontSize: 12, outline: "none" }}
                />
              </label>
            </div>
            {isDirty && (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setWfhConfigDraft(null)}
                  style={{ ...actionBtn(T.grey500, "#F3F4F6"), fontSize: 11, padding: "3px 9px" }}>
                  Cancel
                </button>
                <button onClick={onSaveWfhConfig} disabled={savingWfhConfig}
                  style={{ ...actionBtn("#fff", T.green), fontSize: 11, padding: "3px 9px" }}>
                  {savingWfhConfig ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
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
  const [clearing,        setClearing]        = useState(false);
  const [toast,           setToast]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [showModal,       setShowModal]       = useState(false);
  const [previewData,     setPreviewData]     = useState(null);
  const [loadingPreview,  setLoadingPreview]  = useState(false);
  const [testMode,        setTestMode]        = useState(true);
  const [testEmail,       setTestEmail]       = useState("pranjalg.work@gmail.com");
  const [togglingTest,    setTogglingTest]    = useState(false);
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
  const [wfhConfig,       setWfhConfig]       = useState({ wfo_radius_km: 2.0, wfh_travel_km: 2.0 });
  const [wfhConfigDraft,  setWfhConfigDraft]  = useState(null); // null = not editing
  const [savingWfhConfig, setSavingWfhConfig] = useState(false);

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
      // Load stored GPS results + thresholds config (non-blocking)
      try {
        const [wfhRes, wfhCfgRes] = await Promise.allSettled([
          axios.get(`${API}/WFH-WFO/STATUS`),
          axios.get(`${API}/WFH-WFO/CONFIG`),
        ]);
        if (wfhRes.status === "fulfilled") {
          const validResults = (wfhRes.value.data.results || []).filter(r => r.status === "WFH" || r.status === "WFO");
          setWfhStoredAt(wfhRes.value.data.analyzed_at || null);
          setWfhStoredCount(validResults.length);
        }
        if (wfhCfgRes.status === "fulfilled") {
          setWfhConfig(wfhCfgRes.value.data);
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
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        background: "#EFF6FF", border: "1px solid #BFDBFE",
        borderRadius: 10, padding: "11px 16px",
        fontSize: 12.5, color: "#1e40af",
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Upload all 4 required files below each day before clicking <strong>Send Reports Now</strong>.
          Files uploaded on a previous day are shown as <strong>Outdated</strong> — always replace them with today's data.
          Use the <strong>Test Emails</strong> panel to verify the output before a full send.
        </span>
      </div>

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
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}>
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
          />
        </div>
      )}

      {/* ── test email panel ── */}
      <div style={{
        background: "#fff", border: "1px solid #E5E2DC",
        borderRadius: 14, padding: "18px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "rgba(124,58,237,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Send size={15} color="#7C3AED" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.black }}>Test Emails</p>
            <p style={{ margin: 0, fontSize: 12, color: T.grey500 }}>
              Sends to <strong>{testEmail}</strong> only — subjects prefixed with [TEST]
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { type: "management", label: "Management Email",   desc: "All-circle summary" },
            { type: "circles",    label: "Circle Head Emails", desc: "One per circle"      },
            { type: "managers",   label: "Manager Emails",     desc: "One per manager"     },
          ].map(({ type, label, desc }) => {
            const busy = testSendingType === type;
            const disabled = !!testSendingType || sending || serverOnline !== true;
            return (
              <button
                key={type}
                onClick={() => handleTestSend(type)}
                disabled={disabled}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  gap: 2, padding: "10px 16px", borderRadius: 10,
                  border: "1.5px solid #7C3AED",
                  background: busy ? "rgba(124,58,237,0.08)" : "transparent",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled && !busy ? 0.5 : 1,
                  transition: "background .15s",
                  fontFamily: "'DM Sans', sans-serif",
                  minWidth: 170,
                }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(124,58,237,0.08)"; }}
                onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "#7C3AED" }}>
                  {busy
                    ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : <Send size={13} />}
                  {busy ? "Sending…" : label}
                </span>
                <span style={{ fontSize: 11.5, color: T.grey500, paddingLeft: 20 }}>{desc}</span>
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
