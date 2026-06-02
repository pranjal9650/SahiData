import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Search, Download, Trash2, MapPin,
  CheckCircle, XCircle, Clock, Navigation2, Plus, X, FolderOpen,
} from "lucide-react";

/* ── Design tokens ────────────────────────────────────────────── */
const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  redLight: "rgba(204,0,0,0.07)",
  black:    "#111111",
  white:    "#FFFFFF",
  grey100:  "#F7F5F0",
  grey200:  "#E5E2DC",
  grey500:  "#6B7280",
  border:   "#E5E2DC",
  green:    "#15803d",
  greenBg:  "rgba(21,128,61,0.07)",
  orange:   "#c2410c",
  orangeBg: "rgba(194,65,12,0.07)",
  blue:     "#1d4ed8",
  blueBg:   "rgba(29,78,216,0.07)",
  purple:   "#7c3aed",
  purpleBg: "rgba(124,58,237,0.07)",
};

const TOLERANCE  = 500;
const STORAGE_KEY = "siteVisitReports";
const CACHE_KEY   = "siteVisitMasterCache";

/* ── Haversine ────────────────────────────────────────────────── */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Extract India GPS pairs from any cell string ─────────────── */
function extractCoords(cellValue) {
  const str = String(cellValue == null ? "" : cellValue);
  const coords = [];
  const re1 = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/g;
  const re2 = /(-?\d{1,3}\.\d{4,})\s+(-?\d{2,3}\.\d{4,})/g;
  for (const re of [re1, re2]) {
    let m;
    while ((m = re.exec(str)) !== null) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (lat >= 6 && lat <= 38 && lng >= 60 && lng <= 100)
        coords.push({ lat, lng });
    }
  }
  return coords;
}

/* ── Column finder ────────────────────────────────────────────── */
function makeCi(headers) {
  return (...names) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n.toLowerCase());
      if (i !== -1) return i;
    }
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(n.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };
}

/* ── Master parsers ───────────────────────────────────────────── */
function parsePanIndia(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 4) return new Map();
  const origHeaders = rows[2].map((h) => String(h || "").trim());
  const headers = origHeaders.map((h) => h.toLowerCase().replace(/\r?\n/g, " "));
  const ci  = makeCi(headers);
  const iId   = ci("stpl site id", "site id");
  const iName = ci("site name", "sitename", "site_name", "name");
  const iCirc = ci("circle name", "circle");
  const iDist = ci("district");
  const iLat  = ci("latitude");
  const iLng  = ci("longitude");
  const latColName = origHeaders[iLat] || "Latitude";
  const lngColName = origHeaders[iLng] || "Longitude";
  const map = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r  = rows[i];
    const id = String(r[iId] || "").trim();
    if (!id) continue;
    const lat = parseFloat(r[iLat]), lng = parseFloat(r[iLng]);
    map.set(id.toUpperCase(), {
      stsId:  id,
      name:   String(r[iName] || "").trim(),
      circle: String(r[iCirc] || "").trim(),
      dist:   String(r[iDist] || "").trim(),
      lat:    !isNaN(lat) && lat ? lat : null,
      lng:    !isNaN(lng) && lng ? lng : null,
      source: "PAN India",
      masterRowNum: i + 1,
      latColName,
      lngColName,
    });
  }
  return map;
}

function parseLLSheet(ws, map) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) return;
  const origHeaders = rows[0].map((h) => String(h || "").trim());
  const headers = origHeaders.map((h) => h.toLowerCase().replace(/\r?\n/g, " "));
  const ci    = makeCi(headers);
  const iId   = ci("sts site id", "stpl site id", "site id", "siteid", "site_id", "temp siteid");
  const iName = ci("site name", "sitename", "site_name", "name");
  const iCirc = ci("circle name", "circle");
  const iDist = ci("district");
  const iLat  = ci("lat", "latitude");
  const iLng  = ci("lng", "long", "longitude", "longtitude");
  if (iId === -1 || iLat === -1 || iLng === -1) return;
  const latColName = origHeaders[iLat] || "Lat";
  const lngColName = origHeaders[iLng] || "Long";
  for (let i = 1; i < rows.length; i++) {
    const r   = rows[i];
    const id  = String(r[iId] || "").trim();
    const lat = parseFloat(r[iLat]), lng = parseFloat(r[iLng]);
    if (!id || isNaN(lat) || isNaN(lng) || !lat || !lng) continue;
    if (map.has(id.toUpperCase())) continue;
    map.set(id.toUpperCase(), {
      stsId:  id,
      name:   String(r[iName] || "").trim(),
      circle: String(r[iCirc] || "").trim(),
      dist:   String(r[iDist] || "").trim(),
      lat, lng,
      source: "Master File",
      masterRowNum: i + 1,
      latColName,
      lngColName,
    });
  }
}

function parseSiteLatLong(wb) {
  const map  = new Map();
  const order = ["Site master", "DPR", "GUJ&MUM", ...wb.SheetNames];
  const seen  = new Set();
  for (const name of order) {
    if (seen.has(name) || !wb.Sheets[name]) continue;
    seen.add(name);
    parseLLSheet(wb.Sheets[name], map);
  }
  return map;
}

function buildMergedArray(panIdMap, llIdMap) {
  const merged = new Map();
  for (const [k, v] of panIdMap) merged.set(k, v);
  for (const [k, v] of llIdMap) {
    if (merged.has(k))
      merged.set(k, { ...merged.get(k), lat: v.lat, lng: v.lng });
    else merged.set(k, v);
  }
  return [...merged.values()].filter((s) => s.lat && s.lng);
}

/* ── Distance formatter ───────────────────────────────────────── */
function fmtDist(m) {
  if (m == null) return null;
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

/* ── Time formatter ───────────────────────────────────────────── */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtTime(val) {
  if (!val && val !== 0) return "–";
  const s = String(val).trim();
  if (!s) return "–";
  let d;
  if (/^\d{9,13}$/.test(s)) {
    const ms = s.length <= 10 ? Number(s) * 1000 : Number(s);
    d = new Date(ms);
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return s;
  const dd  = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${dd} ${mon} ${hh}:${min}:${sec}`;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Main Component                                                 */
/* ═══════════════════════════════════════════════════════════════ */
export default function SiteVisit() {

  /* ── Master files state ──────────────────────────────────────── */
  // Each entry: { id, name, sites: [{stsId, name, circle, dist, lat, lng, source}] }
  const [masterFiles, setMasterFiles]   = useState([]);
  const [masterParsing, setMasterParsing] = useState(false);
  const [masterError, setMasterError]   = useState("");
  const masterFileRef = useRef(null);

  // Merged master sites — derived from all uploaded master files
  const masterSites = useMemo(() => {
    const map = new Map();
    for (const mf of masterFiles) {
      for (const site of mf.sites) {
        const key = (site.stsId || "").toUpperCase();
        if (key && !map.has(key)) map.set(key, site);
      }
    }
    return [...map.values()];
  }, [masterFiles]);

  const masterReady = masterSites.length > 0;

  /* ── OD Survey state ─────────────────────────────────────────── */
  const [odRows, setOdRows]         = useState([]); // [{lat, lng}]
  const [odFileName, setOdFileName] = useState("");
  const [odUploadedAt, setOdUploadedAt] = useState("");
  const [odParsing, setOdParsing]   = useState(false);
  const [odError, setOdError]       = useState("");
  const odFileRef = useRef(null);

  /* ── OD Operation Form state ────────────────────────────────── */
  const [odOpMasterSites, setOdOpMasterSites]     = useState([]);
  const [odOpMasterFileName, setOdOpMasterFileName] = useState("");
  const [odOpMasterParsing, setOdOpMasterParsing] = useState(false);
  const [odOpMasterError, setOdOpMasterError]     = useState("");
  const odOpMasterRef = useRef(null);
  const [odOpResults, setOdOpResults]   = useState([]);
  const [odOpFileName, setOdOpFileName] = useState("");
  const [odOpParsing, setOdOpParsing]   = useState(false);
  const [odOpError, setOdOpError]       = useState("");
  const odOpRef = useRef(null);

  const [formType, setFormType] = useState("od-survey");

  const odOpReady      = odOpMasterSites.length > 0 && odOpResults.length > 0;
  const gpsUploadEnabled = masterReady || odOpReady;

  /* ── Reports / queue state ───────────────────────────────────── */
  const [reports, setReports]           = useState(() =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
  );
  const [activeReport, setActiveReport] = useState(null);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entries, setEntries]           = useState([]);
  const [queueName, setQueueName]       = useState("");
  const [queueFileName, setQueueFileName] = useState("");
  const queueFileRef = useRef(null);
  const [uploadMsg, setUploadMsg]       = useState(null);
  const [uploading, setUploading]       = useState(false);

  /* ── Load cached master files on mount ──────────────────────── */
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.masterFiles?.length) {
          setMasterFiles(parsed.masterFiles);
        } else if (parsed.pan && parsed.ll) {
          // Migrate old cache format
          const sites = buildMergedArray(new Map(parsed.pan), new Map(parsed.ll));
          if (sites.length)
            setMasterFiles([{ id: "cached", name: parsed.fileName || "Cached master", sites }]);
        }
      }
    } catch (_) {}
  }, []);

  /* ── Persist master files to cache whenever they change ─────── */
  useEffect(() => {
    if (masterFiles.length)
      localStorage.setItem(CACHE_KEY, JSON.stringify({ masterFiles }));
  }, [masterFiles]);

  /* ── Upload & parse one master file ─────────────────────────── */
  async function handleMasterUpload(file) {
    if (!file) return;
    setMasterParsing(true);
    setMasterError("");
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(new Uint8Array(buf), { type: "array" });
      const panMap = wb.Sheets["Site master"]
        ? parsePanIndia(wb.Sheets["Site master"])
        : new Map();
      const llMap  = parseSiteLatLong(wb);
      const sites  = buildMergedArray(panMap, llMap);
      if (!sites.length)
        throw new Error("No sites with lat/long coordinates found in this file");
      const taggedSites = sites.map((s) => ({ ...s, masterFileName: file.name }));
      const uploadedAt = new Date().toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
      setMasterFiles((prev) => [
        ...prev,
        { id: Date.now().toString(), name: file.name, sites: taggedSites, uploadedAt },
      ]);
    } catch (err) {
      setMasterError(err.message);
    }
    setMasterParsing(false);
    if (masterFileRef.current) masterFileRef.current.value = "";
  }

  function removeMasterFile(id) {
    setMasterFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAllMasters() {
    setMasterFiles([]);
    localStorage.removeItem(CACHE_KEY);
  }

  /* ── Upload & parse OD Survey file ──────────────────────────── */
  async function handleOdUpload(file) {
    if (!file) return;
    setOdParsing(true);
    setOdError("");
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) throw new Error("OD Survey file has no data rows");
      const headers = rows[0].map((h) => String(h || "").trim().toLowerCase().replace(/\r?\n/g, " "));
      const ci = makeCi(headers);
      const iLat   = ci("survey lat", "survey_lat", "surveyLat", "lat", "latitude");
      const iLng   = ci("survey long", "survey_long", "survey lng", "survey_lng", "surveyLng", "lng", "long", "longitude");
      const iOpco  = ci("opco id", "opco_id", "opcoid", "opco site id", "opco site", "site id", "siteid");
      const iName  = ci("user name", "username", "employee name", "person name", "person", "name");
      if (iLat === -1 || iLng === -1) throw new Error("No survey lat/long columns found. Expected columns: 'Survey Lat' and 'Survey Long'");
      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const lat = parseFloat(rows[i][iLat]), lng = parseFloat(rows[i][iLng]);
        if (isNaN(lat) || isNaN(lng) || !lat || !lng) continue;
        if (lat < 6 || lat > 38 || lng < 60 || lng > 100) continue;
        const opcoId     = iOpco !== -1 ? String(rows[i][iOpco] || "").trim() : "";
        const personName = iName !== -1 ? String(rows[i][iName] || "").trim() : "";
        parsed.push({ lat, lng, opcoId, personName, rowNum: i + 1 });
      }
      if (!parsed.length) throw new Error("No valid GPS coordinates found in OD Survey file");
      setOdRows(parsed);
      setOdFileName(file.name);
      setOdUploadedAt(new Date().toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }));
    } catch (err) {
      setOdError(err.message);
    }
    setOdParsing(false);
    if (odFileRef.current) odFileRef.current.value = "";
  }

  function clearOdSurvey() {
    setOdRows([]); setOdFileName(""); setOdUploadedAt(""); setOdError("");
  }

  /* ── Upload & parse OD Operation Master File ────────────────── */
  async function handleOdOpMasterUpload(file) {
    if (!file) return;
    setOdOpMasterParsing(true);
    setOdOpMasterError("");
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) throw new Error("File has no data rows");
      const origHeaders = rows[0].map(h => String(h || "").trim());
      const headers = origHeaders.map(h => h.toLowerCase());
      const ci = makeCi(headers);
      const iId   = ci("viltempid", "vil temp id", "nominal", "stpl site id", "site id", "siteid");
      const iName = ci("sitename", "site name", "name");
      const iLat  = ci("lat", "latitude");
      const iLng  = ci("long", "lng", "longitude");
      if (iId === -1)  throw new Error("No site ID column found (expected: VILTEMPID, Nominal, or Site ID)");
      if (iLat === -1 || iLng === -1) {
        const isForm = ci("incident remark", "problem resolved", "reason of visit", "createduser", "created user") !== -1;
        if (isForm) throw new Error("This looks like the OD Operation Form — upload it in the 'OD Operation Form' section below. Upload the ALL CIRCLES NOMINAL master file here (needs VILTEMPID + LAT/LONG columns).");
        throw new Error("Master file must have LAT and LONG columns with site coordinates (e.g. ALL CIRCLES NOMINAL).");
      }
      const latColName = origHeaders[iLat] || "LAT";
      const lngColName = origHeaders[iLng] || "LONG";
      const sites = [];
      for (let i = 1; i < rows.length; i++) {
        const r   = rows[i];
        const id  = String(r[iId] || "").trim();
        const lat = parseFloat(r[iLat]), lng = parseFloat(r[iLng]);
        if (!id || isNaN(lat) || isNaN(lng) || !lat || !lng) continue;
        if (lat < 6 || lat > 38 || lng < 60 || lng > 100) continue;
        sites.push({ stsId: id, name: String(r[iName] || "").trim(), lat, lng,
          masterRowNum: i + 1, masterFileName: file.name, latColName, lngColName });
      }
      if (!sites.length) throw new Error("No valid sites with coordinates found");
      setOdOpMasterSites(sites);
      setOdOpMasterFileName(file.name);
      setOdOpResults([]); setOdOpFileName(""); // clear form if master changes
    } catch (err) {
      setOdOpMasterError(err.message);
    }
    setOdOpMasterParsing(false);
    if (odOpMasterRef.current) odOpMasterRef.current.value = "";
  }

  function clearOdOpMaster() {
    setOdOpMasterSites([]); setOdOpMasterFileName(""); setOdOpMasterError("");
    setOdOpResults([]); setOdOpFileName("");
  }

  /* ── Upload & parse OD Operation Form ───────────────────────── */
  async function handleOdOpUpload(file) {
    if (!file) return;
    setOdOpParsing(true);
    setOdOpError("");
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) throw new Error("OD Operation file has no data rows");
      const headers = rows[0].map(h => String(h || "").trim().toLowerCase().replace(/\r?\n/g, " "));
      const ci = makeCi(headers);
      const iNominal  = ci("nominal", "stpl site id", "site id", "siteid");
      const iUser     = ci("createduser", "created user", "modifieduser", "modified user", "username", "employee", "person");
      const iTime     = ci("time/date", "time", "date", "createddate", "timestamp");
      const iRemark   = ci("incident remark", "remark", "reason of visit", "reason");
      const iResolved = ci("problem resolved", "resolved", "problem");
      const iType     = ci("type of site", "type", "site type");
      if (iNominal === -1) throw new Error("No 'Nominal' column found in OD Operation file");
      if (!odOpMasterSites.length) throw new Error("Upload the ALL CIRCLES NOMINAL master file first (Step 1 above) — needed to look up site coordinates.");
      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r.some(c => String(c || "").trim())) continue;
        const nominal = String(r[iNominal] || "").trim();
        if (!nominal || nominal.toLowerCase() === "nan") continue;
        const userName  = iUser     !== -1 ? String(r[iUser]     || "").trim() : "";
        const timeStr   = iTime     !== -1 ? String(r[iTime]     || "").trim() : "";
        const remark    = iRemark   !== -1 ? String(r[iRemark]   || "").trim() : "";
        const resolved  = iResolved !== -1 ? String(r[iResolved] || "").trim() : "";
        const siteType  = iType     !== -1 ? String(r[iType]     || "").trim() : "";
        const norm = nominal.toLowerCase();
        const matchedSite = odOpMasterSites.find(s =>
          (s.stsId && s.stsId.trim().toLowerCase() === norm) ||
          (s.name  && s.name.trim().toLowerCase()  === norm));
        parsed.push({ nominal, userName, timeStr, remark, resolved, siteType,
          siteName: matchedSite?.name || "", circle: matchedSite?.circle || "",
          siteLat: matchedSite?.lat ?? null, siteLng: matchedSite?.lng ?? null,
          masterRowNum: matchedSite?.masterRowNum ?? null,
          masterFileName: matchedSite?.masterFileName || "",
          latColName: matchedSite?.latColName || "", lngColName: matchedSite?.lngColName || "",
          matched: !!matchedSite });
      }
      if (!parsed.length) throw new Error("No valid rows found in OD Operation file");
      setOdOpResults(parsed);
      setOdOpFileName(file.name);
    } catch (err) {
      setOdOpError(err.message);
    }
    setOdOpParsing(false);
    if (odOpRef.current) odOpRef.current.value = "";
  }

  function clearOdOp() {
    setOdOpResults([]); setOdOpFileName(""); setOdOpError("");
  }

  function downloadOdOpExcel() {
    if (!odOpResults.length) return;
    const hdrs = ["#","Person","Nominal (Site ID)","Site Name","Circle","Type of Site","Incident Remark","Problem Resolved","Time/Date","Status"];
    const data = odOpResults.map((r, i) => [
      i + 1, r.userName, r.nominal, r.siteName, r.circle, r.siteType,
      r.remark, r.resolved, r.timeStr,
      r.matched ? "Site Found in Master" : "Site Not in Master",
    ]);
    const xlWs = XLSX.utils.aoa_to_sheet([hdrs, ...data]);
    const xlWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(xlWb, xlWs, "OD Operation");
    XLSX.writeFile(xlWb, "OD_Operation_Verified.xlsx");
  }

  /* ── Persist reports ─────────────────────────────────────────── */
  function persistReports(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setReports(list);
  }

  function deleteReport(id, e) {
    e.stopPropagation();
    if (!window.confirm("Delete this report?")) return;
    const next = reports.filter((r) => r.id !== id);
    persistReports(next);
    if (activeReport?.id === id) setActiveReport(null);
  }

  /* ── Queue management ────────────────────────────────────────── */
  function addToQueue(e) {
    e.preventDefault();
    const file = queueFileRef.current?.files[0];
    if (!file) return;
    setEntries((prev) => [
      ...prev,
      { id: Date.now().toString() + Math.random(), name: queueName.trim(), file, fileName: file.name },
    ]);
    setQueueName("");
    setQueueFileName("");
    if (queueFileRef.current) queueFileRef.current.value = "";
  }

  function removeFromQueue(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  /* ── Process one GPS file ────────────────────────────────────── */
  async function processFile(manualName, file) {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(new Uint8Array(buf), { type: "array" });

    const gpsRe = /(\d{1,3}\.\d+)\s*,\s*(\d{1,3}\.\d+)/;
    let ws = wb.Sheets[wb.SheetNames[0]];
    for (const sheetName of wb.SheetNames) {
      const sample = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" }).slice(0, 60);
      const found = sample.some((row) =>
        row.some((cell) => {
          const m = gpsRe.exec(String(cell || ""));
          if (!m) return false;
          const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
          return lat >= 6 && lat <= 38 && lng >= 60 && lng <= 100;
        })
      );
      if (found) { ws = wb.Sheets[sheetName]; break; }
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 2) throw new Error(`${file.name}: file has no data rows`);

    const HDR_KW = ["lat","long","lng","gps","name","employee","person",
                    "staff","date","time","id","site","status","tracker"];
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const cells    = rows[r].map((c) => String(c || "").trim().toLowerCase());
      const nonEmpty = cells.filter(Boolean).length;
      const hits     = cells.filter((c) => HDR_KW.some((k) => c.includes(k))).length;
      if (nonEmpty >= 3 && hits >= 2) { headerRowIdx = r; break; }
    }

    const headers = rows[headerRowIdx].map((h) => String(h || "").trim().toLowerCase());
    const ci = makeCi(headers);

    const colTime    = ci("time (gmt", "time", "timestamp", "date");
    const colTracker = ci("tracker_id", "tracker", "device");
    const colPerson  = ci("full name", "employee name", "staff name", "person name",
                          "person", "name", "employee", "user", "field", "engineer");
    const colRemark  = ci("validated remark", "remark", "validated", "status", "attendance");

    let colLat = ci("latitude", "lat");
    let colLng = ci("longitude", "lon", "long", "lng");
    let colCombined = -1;

    if (colLat !== -1 && colLng !== -1 && colLat !== colLng) {
      const samp = rows.slice(headerRowIdx + 1, headerRowIdx + 11);
      const tLat = parseFloat(String(samp.map((r) => r[colLat]).find((v) => String(v || "").trim()) || ""));
      const tLng = parseFloat(String(samp.map((r) => r[colLng]).find((v) => String(v || "").trim()) || ""));
      if (isNaN(tLat) || isNaN(tLng) || tLat < 6 || tLat > 38 || tLng < 60 || tLng > 100)
        colLat = colLng = -1;
    } else { colLat = colLng = -1; }

    if (colLat === -1 || colLng === -1) {
      const numCols = rows[headerRowIdx]?.length || 0;
      const scanEnd = Math.min(rows.length, headerRowIdx + 200);
      let best = 0;
      for (let c = 0; c < numCols; c++) {
        let count = 0;
        for (let i = headerRowIdx + 1; i < scanEnd; i++)
          if (rows[i] && extractCoords(rows[i][c]).length > 0) count++;
        if (count > best) { best = count; colCombined = c; }
      }
    }

    if (colLat === -1 && colLng === -1 && colCombined === -1) {
      const preview = headers.slice(0, 8).filter(Boolean).join(" | ");
      throw new Error(`${file.name}: no GPS columns found. Columns: ${preview || "(none)"}`);
    }

    const allData = rows.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c || "").trim()));
    const nameSet = new Set();
    if (colPerson !== -1) allData.forEach((r) => { const n = String(r[colPerson] || "").trim(); if (n) nameSet.add(n); });
    const isProductivity = nameSet.size > 1 && nameSet.size / allData.length >= 0.4;

    const resultRows = [];
    let matchedCount = 0;
    const rawPings = new Map(); // personName.toLowerCase() -> [{lat,lng}]

    if (isProductivity) {
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r.some((c) => String(c || "").trim())) continue;
        const pName = (colPerson !== -1 ? String(r[colPerson] || "").trim() : "") || manualName || "Unknown";
        const fileStatus = colRemark !== -1 ? String(r[colRemark] || "").trim() : "";
        let rowLat = null, rowLng = null;
        if (colLat !== -1 && colLng !== -1) {
          const la = parseFloat(r[colLat]), lo = parseFloat(r[colLng]);
          if (!isNaN(la) && !isNaN(lo) && la && lo) { rowLat = la; rowLng = lo; }
        } else if (colCombined !== -1) {
          const coords = extractCoords(r[colCombined]);
          if (coords.length) { rowLat = coords[0].lat; rowLng = coords[0].lng; }
        }
        if (rowLat !== null && rowLng !== null) {
          const key = pName.toLowerCase();
          if (!rawPings.has(key)) rawPings.set(key, []);
          rawPings.get(key).push({ lat: rowLat, lng: rowLng });
        }
        let nearestSite = null, nearestDist = Infinity;
        if (rowLat !== null) {
          for (const site of masterSites) {
            const d = haversineMeters(rowLat, rowLng, site.lat, site.lng);
            if (d < nearestDist) { nearestDist = d; nearestSite = site; }
          }
        }
        const verified = nearestDist <= TOLERANCE;
        if (verified) matchedCount++;
        resultRows.push({
          personName:      pName,
          timeOfVisit:     "",
          userLat:         rowLat,
          userLng:         rowLng,
          matchedSiteId:   nearestSite?.stsId        || "",
          matchedSiteName: nearestSite?.name         || "",
          district:        nearestSite?.dist         || "",
          circle:          nearestSite?.circle       || "",
          masterSource:    nearestSite?.source       || "",
          masterFileName:  nearestSite?.masterFileName || "",
          masterRowNum:    nearestSite?.masterRowNum  ?? "",
          masterLatCol:    nearestSite?.latColName    || "",
          masterLngCol:    nearestSite?.lngColName    || "",
          masterLat:       nearestSite?.lat           ?? null,
          masterLng:       nearestSite?.lng           ?? null,
          distanceMeters:  nearestDist !== Infinity ? Math.round(nearestDist) : null,
          matched:         verified,
          status:          rowLat === null ? (fileStatus || "No GPS") : (verified ? "Work Done - Verified" : "Not at Master Site"),
        });
      }
    } else {
      const pingsByPerson = new Map();
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r    = rows[i];
        const time = colTime !== -1 ? String(r[colTime] || "") : "";
        let rPerson = manualName;
        if (!rPerson) {
          if (colPerson !== -1 && String(r[colPerson] || "").trim()) rPerson = String(r[colPerson]).trim();
          else if (colTracker !== -1 && String(r[colTracker] || "").trim()) {
            const raw = String(r[colTracker]).trim();
            rPerson = raw.includes("@") ? raw.split("@")[1] : raw;
          }
        }
        if (!rPerson) rPerson = "Unknown";
        if (!pingsByPerson.has(rPerson)) pingsByPerson.set(rPerson, []);
        const bucket = pingsByPerson.get(rPerson);
        if (colLat !== -1 && colLng !== -1) {
          const lat = parseFloat(r[colLat]), lng = parseFloat(r[colLng]);
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
          bucket.push({ lat, lng, time });
        } else {
          const coords = extractCoords(r[colCombined]);
          if (!coords.length) continue;
          for (const { lat, lng } of coords) bucket.push({ lat, lng, time });
        }
      }
      const totalPings = [...pingsByPerson.values()].reduce((s, a) => s + a.length, 0);
      if (!totalPings) throw new Error(`${file.name}: no valid GPS coordinates found`);
      for (const [pName, pings] of pingsByPerson) {
        rawPings.set(pName.toLowerCase(), pings.map(p => ({ lat: p.lat, lng: p.lng })));
      }
      for (const [pName, pings] of pingsByPerson) {
        for (const site of masterSites) {
          let nearestDist = Infinity, nearestTime = "", nearestLat = null, nearestLng = null;
          const degTol = TOLERANCE / 111000;
          for (const ping of pings) {
            if (Math.abs(ping.lat - site.lat) > degTol) continue;
            if (Math.abs(ping.lng - site.lng) > degTol) continue;
            const d = haversineMeters(ping.lat, ping.lng, site.lat, site.lng);
            if (d < nearestDist) { nearestDist = d; nearestTime = ping.time; nearestLat = ping.lat; nearestLng = ping.lng; }
          }
          if (nearestDist > TOLERANCE) continue;
          matchedCount++;
          resultRows.push({
            personName: pName, timeOfVisit: nearestTime,
            userLat: nearestLat, userLng: nearestLng,
            matchedSiteId: site.stsId, matchedSiteName: site.name,
            district: site.dist, circle: site.circle, masterSource: site.source,
            masterFileName: site.masterFileName || "",
            masterRowNum:   site.masterRowNum   ?? "",
            masterLatCol:   site.latColName     || "",
            masterLngCol:   site.lngColName     || "",
            masterLat: site.lat, masterLng: site.lng,
            distanceMeters: Math.round(nearestDist), matched: true,
            status: "Work Done - Verified",
          });
        }
      }
    }
    return { resultRows, matchedCount, rawPings };
  }

  /* ── Match all queued entries ────────────────────────────────── */
  async function handleMatchAll() {
    if (!entries.length || !gpsUploadEnabled || uploading) return;
    setUploading(true);
    setUploadMsg(null);

    // Build OD site map using criterion 1: opco id (OD form) matches site id (master)
    const odSiteMap  = new Map();
    const odNoMatch  = []; // opcoId not found in master at all
    const odGpsFar   = []; // opcoId matched but GPS > 500m
    for (const { lat, lng, opcoId, personName } of odRows) {
      if (!opcoId) continue;
      const norm = opcoId.trim().toLowerCase();
      const matchedSite = masterSites.find(
        (s) => s.stsId && s.stsId.trim().toLowerCase() === norm
      );
      if (!matchedSite) {
        odNoMatch.push({ opcoId, personName, surveyLat: lat, surveyLng: lng });
        continue;
      }
      // Criterion 2: OD survey GPS must be within 500m of the master site GPS
      const distToSite = (matchedSite.lat && matchedSite.lng)
        ? Math.round(haversineMeters(lat, lng, matchedSite.lat, matchedSite.lng))
        : null;
      if (distToSite !== null && distToSite > TOLERANCE) {
        odGpsFar.push({ opcoId, personName, surveyLat: lat, surveyLng: lng, distToSite });
        continue;
      }
      const key = matchedSite.stsId.toUpperCase();
      if (!odSiteMap.has(key))
        odSiteMap.set(key, { surveyLat: lat, surveyLng: lng, distToSite, personName });
    }

    const allRows = [];
    let totalMatched = 0;
    const allPings = new Map(); // personName.toLowerCase() -> [{lat,lng}]
    for (const entry of entries) {
      try {
        const { resultRows, matchedCount, rawPings } = await processFile(entry.name, entry.file);
        if (formType !== "od-operation") {
          // Attach OD Survey verification to each row and add to main GPS table
          for (const row of resultRows) {
            const key = (row.matchedSiteId || "").toUpperCase();
            const od  = odSiteMap.get(key);
            row.odVerified   = !!od;
            row.odSurveyLat  = od?.surveyLat  ?? null;
            row.odSurveyLng  = od?.surveyLng  ?? null;
            row.odSurveyDist = od?.distToSite ?? null;
          }
          allRows.push(...resultRows);
          totalMatched += matchedCount;
        }
        // Collect raw GPS pings for OD Operation GPS verification
        for (const [key, pings] of rawPings) {
          if (!allPings.has(key)) allPings.set(key, []);
          allPings.get(key).push(...pings);
        }
      } catch (err) {
        setUploadMsg({ text: "Error: " + err.message, type: "error" });
        setUploading(false);
        return;
      }
    }
    // Show ALL OD form entries so the user can see every submission
    // OD entries that matched master but no GPS file row visited that site
    const gpsMatchedSiteKeys = new Set(allRows.map(r => (r.matchedSiteId || "").toUpperCase()).filter(Boolean));
    for (const [siteKey, odData] of odSiteMap) {
      if (!gpsMatchedSiteKeys.has(siteKey)) {
        allRows.push({
          odMismatch:      true,
          personName:      odData.personName || "—",
          matchedSiteId:   siteKey,
          matchedSiteName: "",
          circle:          "",
          matched:         false,
          odVerified:      false,
          status:          "OD Submitted — site not in GPS file",
          odMismatchReason: "Site verified in OD form — not found in GPS tracker file",
          odSurveyLat:     odData.surveyLat,
          odSurveyLng:     odData.surveyLng,
        });
      }
    }
    // OD entries that failed master matching (opco ID not found / GPS too far) — show all, no person filter
    const allUnmatched = [...odNoMatch, ...odGpsFar.map(r => ({ ...r, gpsFar: true }))];
    for (const u of allUnmatched) {
      allRows.push({
        odMismatch:      true,
        personName:      u.personName || "—",
        matchedSiteId:   u.opcoId,
        matchedSiteName: "",
        circle:          "",
        matched:         false,
        odVerified:      false,
        status:          u.gpsFar ? `GPS too far (${u.distToSite} m)` : "Site not in master file",
        odMismatchReason: u.gpsFar ? `GPS too far — ${u.distToSite} m from site` : "Opco ID not found in master/DPR file",
        odSurveyLat:     u.surveyLat,
        odSurveyLng:     u.surveyLng,
      });
    }
    allRows.forEach((r, i) => { r.rowNumber = i + 1; });

    // OD Operation Form GPS verification — only rows for people whose GPS was uploaded
    const uploadedPersonKeys = [...allPings.keys()];
    const odOpFiltered = odOpResults.filter(opRow => {
      const normUser = (opRow.userName || "").toLowerCase();
      return uploadedPersonKeys.some(k => k === normUser || k.includes(normUser) || normUser.includes(k));
    });
    const odOpRows = odOpFiltered.map((opRow, idx) => {
      if (!opRow.matched) return { ...opRow, rowNum: idx + 1, gpsVerified: false, gpsDist: null, closestPing: null, gpsStatus: "Site not in master" };
      if (opRow.siteLat === null || opRow.siteLng === null) return { ...opRow, rowNum: idx + 1, gpsVerified: false, gpsDist: null, closestPing: null, gpsStatus: "Site has no GPS in master" };
      const normUser = (opRow.userName || "").toLowerCase();
      let personPings = [];
      for (const [key, pings] of allPings) {
        if (key === normUser || key.includes(normUser) || normUser.includes(key)) personPings.push(...pings);
      }
      if (!personPings.length) return { ...opRow, rowNum: idx + 1, gpsVerified: false, gpsDist: null, closestPing: null, gpsStatus: "No GPS data for person" };
      let minDist = Infinity, closestPing = null;
      for (const p of personPings) {
        const d = haversineMeters(p.lat, p.lng, opRow.siteLat, opRow.siteLng);
        if (d < minDist) { minDist = d; closestPing = p; }
      }
      const gpsVerified = minDist <= TOLERANCE;
      return { ...opRow, rowNum: idx + 1, gpsVerified, gpsDist: Math.round(minDist), closestPing,
        gpsStatus: gpsVerified ? "Site Visited" : `GPS too far (${Math.round(minDist)} m)` };
    });

    const names = [...new Set(
      entries.map((e) => e.name).filter(Boolean).concat(allRows.map((r) => r.personName).filter(Boolean))
    )].slice(0, 5).join(", ");
    const report = {
      id:           Date.now().toString(),
      fileName:     `Combined — ${entries.length} file${entries.length > 1 ? "s" : ""}`,
      uploadedBy:   names || "Multiple persons",
      createdAt:    new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      matchedCount: totalMatched,
      totalRows:    allRows.length,
      hasOdSurvey:  formType !== "od-operation" && odRows.length > 0,
      hasOdOp:      odOpResults.length > 0,
      formType,
      rows:         allRows,
      odOpRows,
    };
    const all = [report, ...reports].slice(0, 20);
    persistReports(all);
    setActiveReport(report);
    setEntries([]);
    setSearch(""); setStatusFilter("");
    setUploadMsg({ text: `Done — ${allRows.length} rows across ${entries.length} files · ${totalMatched} Verified`, type: "success" });
    setUploading(false);
  }

  /* ── Download Excel ──────────────────────────────────────────── */
  function downloadExcel() {
    if (!activeReport) return;
    const hasOd = activeReport.hasOdSurvey;
    const hdrs = ["#","Person Name","Site ID","Site Name","Circle",
                  "Employee GPS","Master GPS","Match Source (File · Row · Column)",
                  ...(hasOd ? ["OD Survey GPS","OD Verified"] : []),
                  "Gap to Site","Time","Status"];
    const data = displayRows.map((r, i) => [
      i + 1, r.personName,
      r.matchedSiteId || "", r.matchedSiteName || "", r.circle || "",
      r.userLat   != null ? `${r.userLat.toFixed(6)}, ${r.userLng.toFixed(6)}`     : "",
      r.masterLat != null ? `${r.masterLat.toFixed(6)}, ${r.masterLng.toFixed(6)}` : "",
      r.masterFileName
        ? `${r.masterFileName} · Row ${r.masterRowNum}${r.masterLatCol ? ` · ${r.masterLatCol}/${r.masterLngCol}` : ""}`
        : (r.masterSource || ""),
      ...(hasOd ? [
        r.odSurveyLat != null ? `${r.odSurveyLat.toFixed(6)}, ${r.odSurveyLng.toFixed(6)}` : "",
        r.odVerified ? "Yes" : "No",
      ] : []),
      r.distanceMeters != null ? (r.distanceMeters < 1000 ? r.distanceMeters + " m" : (r.distanceMeters / 1000).toFixed(1) + " km") : "",
      fmtTime(r.timeOfVisit), r.status || "",
    ]);
    const xlWs = XLSX.utils.aoa_to_sheet([hdrs, ...data]);
    const baseCols = [5,22,22,28,14,26,26,40];
    const odCols   = hasOd ? [26,12] : [];
    xlWs["!cols"] = [...baseCols, ...odCols, 13,18,22].map((wch) => ({ wch }));
    const xlWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(xlWb, xlWs, "Verification");
    const safeName = activeReport.fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "combined";
    XLSX.writeFile(xlWb, safeName + "_verified.xlsx");
  }

  function downloadOdOpReport() {
    if (!activeReport?.odOpRows?.length) return;
    const hdrs = ["#","Person","Nominal (Site ID)","Site Name","Circle","Type of Site","Incident Remark","Problem Resolved","Time/Date","GPS Status","GPS Distance"];
    const data = activeReport.odOpRows.map((r, i) => [
      i + 1, r.userName, r.nominal, r.siteName, r.circle, r.siteType,
      r.remark, r.resolved, r.timeStr, r.gpsStatus,
      r.gpsDist != null ? (r.gpsDist < 1000 ? r.gpsDist + " m" : (r.gpsDist / 1000).toFixed(1) + " km") : "—",
    ]);
    const xlWs = XLSX.utils.aoa_to_sheet([hdrs, ...data]);
    xlWs["!cols"] = [5,20,22,30,14,14,30,14,20,22,14].map(wch => ({ wch }));
    const xlWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(xlWb, xlWs, "OD Operation");
    XLSX.writeFile(xlWb, "OD_Operation_GPS_Verified.xlsx");
  }

  /* ── Filtered rows ───────────────────────────────────────────── */
  const activeReportHasOd = activeReport && activeReport.hasOdSurvey;
  const displayRows = activeReport
    ? activeReport.rows.filter((r) => {
        const hay = `${r.personName} ${r.matchedSiteId} ${r.matchedSiteName} ${r.district} ${r.circle}`.toLowerCase();
        if (!search || hay.includes(search.toLowerCase())) {
          if (r.odMismatch) {
            // OD mismatch rows always show — they represent real issues regardless of filter
            return true;
          }
          const statusMatch = statusFilter === "3-Way Verified"
            ? (r.matched && r.odVerified)
            : (!statusFilter || r.status === statusFilter);
          // Default: 3-way verified (GPS + OD); "3-Way Verified only" option is same strict check
          const odFilter = activeReportHasOd && !statusFilter ? (r.matched && r.odVerified) : statusMatch;
          return odFilter;
        }
        return false;
      })
    : [];

  /* ── Status pill ─────────────────────────────────────────────── */
  function StatusPill({ status, odVerified, hasOd }) {
    if (status === "Work Done - Verified" && hasOd && odVerified)
      return <span style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:"rgba(161,102,0,0.09)",color:"#92610a",border:"1px solid rgba(161,102,0,0.25)",fontSize:11.5,fontWeight:700,whiteSpace:"nowrap" }}>★ 3-Way Verified</span>;
    if (status === "Work Done - Verified")
      return <span style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:T.greenBg,color:T.green,border:"1px solid rgba(21,128,61,0.2)",fontSize:11.5,fontWeight:600,whiteSpace:"nowrap" }}><CheckCircle size={11}/> Verified</span>;
    if (status === "Not at Master Site")
      return <span style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:T.orangeBg,color:T.orange,border:"1px solid rgba(194,65,12,0.2)",fontSize:11.5,fontWeight:600,whiteSpace:"nowrap" }}><XCircle size={11}/> Not at Site</span>;
    return <span style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:"#f3f4f6",color:"#4b5563",border:"1px solid #e5e7eb",fontSize:11.5,fontWeight:600,whiteSpace:"nowrap" }}><Clock size={11}/> {status}</span>;
  }

  /* ── Shared styles ───────────────────────────────────────────── */
  const card = { background:T.white, border:`1px solid ${T.border}`, borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", overflow:"hidden" };
  const cardHeader = { padding:"14px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" };
  const cardTitle  = { margin:0, fontSize:14, fontWeight:700, color:T.black };

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20, fontFamily:"'DM Sans', sans-serif" }}>

      {/* Page header */}
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:38,height:38,borderRadius:10,background:T.redLight,border:"1px solid rgba(204,0,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Navigation2 size={18} color={T.red}/>
        </div>
        <div>
          <h1 style={{ margin:0,fontSize:20,fontWeight:800,color:T.black,letterSpacing:"-0.4px" }}>User Site Visit</h1>
          <p style={{ margin:0,fontSize:12,color:T.grey500,marginTop:2 }}>Upload master site file(s), then match employee GPS against them (500 m radius)</p>
        </div>
      </div>

      {/* Form type selector */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[
          { id:"od-survey",    label:"OD Survey Form" },
          { id:"od-operation", label:"OD Operation Form" },
          { id:"meeting",      label:"Meeting Form",  disabled:true },
          { id:"eb-meter",     label:"EB Meter",      disabled:true },
        ].map(ft => (
          <button key={ft.id} onClick={()=>!ft.disabled&&setFormType(ft.id)}
            style={{ padding:"7px 18px", borderRadius:99, fontSize:13, fontWeight:600, fontFamily:"inherit",
              background: formType===ft.id ? T.red : "transparent",
              color: formType===ft.id ? "#fff" : ft.disabled ? T.grey500 : T.black,
              border: formType===ft.id ? "none" : `1px solid ${T.border}`,
              cursor: ft.disabled ? "not-allowed" : "pointer",
              opacity: ft.disabled ? 0.45 : 1,
              transition:"all 0.15s" }}>
            {ft.label}{ft.disabled && <span style={{ fontSize:10,marginLeft:5,fontWeight:500 }}>coming soon</span>}
          </button>
        ))}
      </div>

      {/* ── OD Survey flow ───────────────────────────────────────── */}
      {formType === "od-survey" && <>

      {/* ── Step 1: Master files ─────────────────────────────────── */}
      <div style={card}>
        <div style={cardHeader}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:22,height:22,borderRadius:"50%",background:T.red,color:T.white,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>1</span>
            <p style={cardTitle}>Upload Master Site File(s)</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {masterReady && (
              <span style={{ fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.greenBg,color:T.green,border:"1px solid rgba(21,128,61,0.2)" }}>
                ✔ {masterSites.length} total sites from {masterFiles.length} file{masterFiles.length > 1 ? "s" : ""}
              </span>
            )}
            {masterFiles.length > 0 && (
              <button onClick={clearAllMasters} style={{ fontSize:11.5,fontWeight:600,padding:"3px 10px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer" }}
                onMouseEnter={(e)=>{e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                onMouseLeave={(e)=>{e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>
                Clear All
              </button>
            )}
          </div>
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:12,color:T.grey500,background:T.grey100,borderLeft:`3px solid ${T.blue}`,borderRadius:"0 6px 6px 0",padding:"8px 12px",marginBottom:14 }}>
            Upload one or more master Excel files with <strong>Site ID, Latitude and Longitude</strong> columns.
            Sites are merged across all files — duplicates are skipped automatically.
          </div>

          {/* Uploaded master files list */}
          {masterFiles.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
              {masterFiles.map((mf, idx) => (
                <div key={mf.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:T.greenBg,border:"1px solid rgba(21,128,61,0.2)",borderRadius:8 }}>
                  <span style={{ width:20,height:20,borderRadius:"50%",background:T.green,color:T.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0 }}>{idx+1}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5,fontWeight:600,color:T.green,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{mf.name}</div>
                    <div style={{ fontSize:11,color:T.grey500,marginTop:1 }}>{mf.sites.length} sites{mf.uploadedAt ? ` · Uploaded ${mf.uploadedAt}` : ""}</div>
                  </div>
                  <button onClick={() => removeMasterFile(mf.id)}
                    style={{ width:24,height:24,borderRadius:5,border:`1px solid rgba(21,128,61,0.3)`,background:"transparent",color:T.green,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}
                    onMouseEnter={(e)=>{e.currentTarget.style.background=T.redLight;e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.green;e.currentTarget.style.borderColor="rgba(21,128,61,0.3)";}}>
                    <X size={11}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add master file button */}
          <label style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",border:`2px dashed ${T.border}`,borderRadius:10,cursor:"pointer",background:"#fafafa",transition:"all 0.15s" }}
            onMouseEnter={(e)=>{e.currentTarget.style.borderColor=T.blue;e.currentTarget.style.background=T.blueBg;}}
            onMouseLeave={(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="#fafafa";}}>
            <FolderOpen size={18} color={T.grey500}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:600,color:T.black }}>
                {masterParsing ? "Parsing file…" : masterFiles.length > 0 ? "Add another master file" : "Click to choose master file"}
              </div>
              <div style={{ fontSize:11.5,color:T.grey500,marginTop:1 }}>.xlsx / .xls / .xlsb — any sheet with Site ID + Lat + Long columns</div>
            </div>
            <Upload size={14} color={T.grey500}/>
            <input ref={masterFileRef} type="file" accept=".xlsx,.xls,.xlsb,.csv" style={{ display:"none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) handleMasterUpload(f); }}/>
          </label>

          {masterError && (
            <div style={{ marginTop:8,fontSize:12,color:T.red,fontWeight:500 }}>⚠ {masterError}</div>
          )}
        </div>
      </div>

      {/* ── Step 2: OD Survey (optional) ────────────────────────── */}
      <div style={{ ...card, opacity:masterReady?1:0.5, pointerEvents:masterReady?"auto":"none" }}>
        <div style={cardHeader}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:22,height:22,borderRadius:"50%",background:masterReady?T.purple:T.grey500,color:T.white,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>2</span>
            <p style={cardTitle}>Upload OD Survey Form <span style={{ fontWeight:400,color:T.grey500,fontSize:12 }}>(optional)</span></p>
          </div>
          {odFileName && (
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.purpleBg,color:T.purple,border:"1px solid rgba(124,58,237,0.2)" }}>
                ✔ {odRows.length} survey records
              </span>
              <button onClick={clearOdSurvey} style={{ fontSize:11.5,fontWeight:600,padding:"3px 10px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer" }}
                onMouseEnter={(e)=>{e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                onMouseLeave={(e)=>{e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>
                Clear
              </button>
            </div>
          )}
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:12,color:T.grey500,background:T.grey100,borderLeft:`3px solid ${T.purple}`,borderRadius:"0 6px 6px 0",padding:"8px 12px",marginBottom:14 }}>
            Upload the OD Survey form with <strong>Survey Lat</strong> and <strong>Survey Long</strong> columns.
            Each survey record will be matched against master sites — the result will show a 3-way intersection with employee GPS.
          </div>
          {odFileName ? (
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:T.purpleBg,border:"1px solid rgba(124,58,237,0.2)",borderRadius:8 }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:12.5,fontWeight:600,color:T.purple,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{odFileName}</div>
                <div style={{ fontSize:11,color:T.grey500,marginTop:1 }}>{odRows.length} survey GPS records · Uploaded {odUploadedAt}</div>
              </div>
            </div>
          ) : (
            <label style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",border:`2px dashed ${T.border}`,borderRadius:10,cursor:"pointer",background:"#fafafa",transition:"all 0.15s" }}
              onMouseEnter={(e)=>{e.currentTarget.style.borderColor=T.purple;e.currentTarget.style.background=T.purpleBg;}}
              onMouseLeave={(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="#fafafa";}}>
              <FolderOpen size={18} color={T.grey500}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600,color:T.black }}>
                  {odParsing ? "Parsing file…" : "Click to choose OD Survey file"}
                </div>
                <div style={{ fontSize:11.5,color:T.grey500,marginTop:1 }}>.xlsx / .xls / .csv — must have Survey Lat + Survey Long columns</div>
              </div>
              <Upload size={14} color={T.grey500}/>
              <input ref={odFileRef} type="file" accept=".xlsx,.xls,.xlsb,.csv" style={{ display:"none" }}
                onChange={(e) => { const f = e.target.files[0]; if (f) handleOdUpload(f); }}/>
            </label>
          )}
          {odError && <div style={{ marginTop:8,fontSize:12,color:T.red,fontWeight:500 }}>⚠ {odError}</div>}
        </div>
      </div>

      </>} {/* end od-survey flow */}

      {/* ── OD Operation flow ────────────────────────────────────── */}
      {formType === "od-operation" && <>

      {/* OD Op Step 1: Master file */}
      <div style={card}>
        <div style={cardHeader}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:22,height:22,borderRadius:"50%",background:T.red,color:T.white,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>1</span>
            <p style={cardTitle}>Upload OD Operation Master File</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {odOpMasterFileName && (
              <span style={{ fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.greenBg,color:T.green,border:"1px solid rgba(21,128,61,0.2)" }}>
                ✔ {odOpMasterSites.length} sites loaded
              </span>
            )}
            {odOpMasterFileName && (
              <button onClick={clearOdOpMaster} style={{ fontSize:11.5,fontWeight:600,padding:"3px 10px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer" }}
                onMouseEnter={(e)=>{e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                onMouseLeave={(e)=>{e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>Clear</button>
            )}
          </div>
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:12,color:T.grey500,background:T.grey100,borderLeft:`3px solid ${T.blue}`,borderRadius:"0 6px 6px 0",padding:"8px 12px",marginBottom:14 }}>
            Upload the master file (e.g. <strong>ALL CIRCLES NOMINAL</strong>) with <strong>VILTEMPID/Nominal, LAT, LONG</strong> columns. Site coordinates will be looked up from here.
          </div>
          {odOpMasterFileName ? (
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:T.greenBg,border:"1px solid rgba(21,128,61,0.2)",borderRadius:8 }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:12.5,fontWeight:600,color:T.green,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{odOpMasterFileName}</div>
                <div style={{ fontSize:11,color:T.grey500,marginTop:1 }}>{odOpMasterSites.length} sites with coordinates</div>
              </div>
            </div>
          ) : (
            <label style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",border:`2px dashed ${T.border}`,borderRadius:10,cursor:"pointer",background:"#fafafa",transition:"all 0.15s" }}
              onMouseEnter={(e)=>{e.currentTarget.style.borderColor=T.blue;e.currentTarget.style.background=T.blueBg;}}
              onMouseLeave={(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="#fafafa";}}>
              <FolderOpen size={18} color={T.grey500}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600,color:T.black }}>{odOpMasterParsing ? "Parsing file…" : "Click to choose master file"}</div>
                <div style={{ fontSize:11.5,color:T.grey500,marginTop:1 }}>.xlsx / .xls / .csv — must have VILTEMPID/Nominal + LAT + LONG columns</div>
              </div>
              <Upload size={14} color={T.grey500}/>
              <input ref={odOpMasterRef} type="file" accept=".xlsx,.xls,.xlsb,.csv" style={{ display:"none" }}
                onChange={(e)=>{ const f=e.target.files[0]; if(f) handleOdOpMasterUpload(f); }}/>
            </label>
          )}
          {odOpMasterError && <div style={{ marginTop:8,fontSize:12,color:T.red,fontWeight:500 }}>⚠ {odOpMasterError}</div>}
        </div>
      </div>

      {/* OD Op Step 2: OD Operation Form */}
      <div style={{ ...card, opacity:odOpMasterFileName?1:0.5, pointerEvents:odOpMasterFileName?"auto":"none" }}>
        <div style={cardHeader}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:22,height:22,borderRadius:"50%",background:odOpMasterFileName?T.blue:T.grey500,color:T.white,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>2</span>
            <p style={cardTitle}>Upload OD Operation Form <span style={{ fontWeight:400,color:T.grey500,fontSize:12 }}>(optional)</span></p>
          </div>
          {odOpFileName && (
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.blueBg,color:T.blue,border:"1px solid rgba(14,165,233,0.25)" }}>
                ✔ {odOpResults.length} records
              </span>
              <button onClick={clearOdOp} style={{ fontSize:11.5,fontWeight:600,padding:"3px 10px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer" }}
                onMouseEnter={(e)=>{e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                onMouseLeave={(e)=>{e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>Clear</button>
            </div>
          )}
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:12,color:T.grey500,background:T.grey100,borderLeft:`3px solid ${T.blue}`,borderRadius:"0 6px 6px 0",padding:"8px 12px",marginBottom:14 }}>
            Upload the OD Operation form with a <strong>Nominal</strong> column. Each record will be matched against the master file, then GPS-verified against employee location.
          </div>
          {odOpFileName ? (
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:T.blueBg,border:"1px solid rgba(14,165,233,0.25)",borderRadius:8 }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:12.5,fontWeight:600,color:T.blue,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{odOpFileName}</div>
                <div style={{ fontSize:11,color:T.grey500,marginTop:1 }}>{odOpResults.length} records · Upload GPS files below and click Match All to see results</div>
              </div>
            </div>
          ) : (
            <label style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",border:`2px dashed ${T.border}`,borderRadius:10,cursor:odOpMasterFileName?"pointer":"not-allowed",background:"#fafafa",transition:"all 0.15s" }}
              onMouseEnter={(e)=>{if(odOpMasterFileName){e.currentTarget.style.borderColor=T.blue;e.currentTarget.style.background=T.blueBg;}}}
              onMouseLeave={(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="#fafafa";}}>
              <FolderOpen size={18} color={T.grey500}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600,color:T.black }}>{odOpParsing ? "Parsing file…" : "Click to choose OD Operation form"}</div>
                <div style={{ fontSize:11.5,color:T.grey500,marginTop:1 }}>.xlsx / .xls / .csv — must have Nominal column with site IDs</div>
              </div>
              <Upload size={14} color={T.grey500}/>
              <input ref={odOpRef} type="file" accept=".xlsx,.xls,.xlsb,.csv" style={{ display:"none" }}
                onChange={(e)=>{ const f=e.target.files[0]; if(f) handleOdOpUpload(f); }}/>
            </label>
          )}
          {odOpError && <div style={{ marginTop:8,fontSize:12,color:T.red,fontWeight:500 }}>⚠ {odOpError}</div>}
        </div>
      </div>

      </>} {/* end od-operation flow */}

      {/* ── Step 3: Employee GPS files ───────────────────────────── */}
      <div style={{ ...card, opacity:gpsUploadEnabled?1:0.5, pointerEvents:gpsUploadEnabled?"auto":"none" }}>
        <div style={cardHeader}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:22,height:22,borderRadius:"50%",background:gpsUploadEnabled?T.red:T.grey500,color:T.white,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>3</span>
            <p style={cardTitle}>Upload Employee GPS Reports</p>
          </div>
          {entries.length > 0 && (
            <span style={{ fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.blueBg,color:T.blue,border:"1px solid rgba(29,78,216,0.2)" }}>
              {entries.length} file{entries.length > 1 ? "s" : ""} queued
            </span>
          )}
        </div>
        <div style={{ padding:"16px 20px" }}>
          {!gpsUploadEnabled && (
            <div style={{ fontSize:12,color:T.grey500,textAlign:"center",padding:"8px",marginBottom:12 }}>
              Upload a master file first — either the Site Master (Step 1) or the OD Operation master + form above.
            </div>
          )}
          <div style={{ fontSize:12,color:T.grey500,background:T.grey100,borderLeft:`3px solid ${T.red}`,borderRadius:"0 6px 6px 0",padding:"8px 12px",marginBottom:16 }}>
            Add each person's GPS file one by one, then click <strong>Match All</strong> to process together and download one combined Excel.
          </div>

          <form onSubmit={addToQueue} style={{ display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end" }}>
            <div style={{ display:"flex",flexDirection:"column",gap:5,minWidth:180 }}>
              <label style={{ fontSize:11,fontWeight:700,color:T.grey500,textTransform:"uppercase",letterSpacing:"0.04em" }}>Person's Name</label>
              <input type="text" value={queueName} onChange={(e)=>setQueueName(e.target.value)} placeholder="Optional — auto-detected"
                style={{ padding:"8px 11px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",color:T.black,background:"#fafafa",outline:"none" }}
                onFocus={(e)=>(e.target.style.borderColor=T.red)} onBlur={(e)=>(e.target.style.borderColor=T.border)}/>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:220 }}>
              <label style={{ fontSize:11,fontWeight:700,color:T.grey500,textTransform:"uppercase",letterSpacing:"0.04em" }}>GPS Report File</label>
              <label style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`1px dashed ${T.red}`,borderRadius:8,cursor:"pointer",background:T.redLight,color:T.red,fontSize:13,fontWeight:500 }}>
                <Upload size={15}/>
                <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{queueFileName || "Choose file…"}</span>
                <input ref={queueFileRef} type="file" accept=".xlsx,.xls,.csv" required style={{ display:"none" }}
                  onChange={(e)=>setQueueFileName(e.target.files[0]?.name||"")}/>
              </label>
            </div>
            <button type="submit" style={{ padding:"9px 18px",background:T.red,color:T.white,border:"none",borderRadius:8,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:6 }}>
              <Plus size={15}/> Add to Queue
            </button>
          </form>

          {entries.length > 0 && (
            <div style={{ marginTop:16,display:"flex",flexDirection:"column",gap:8 }}>
              {entries.map((entry, idx) => (
                <div key={entry.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:T.grey100,border:`1px solid ${T.border}`,borderRadius:8 }}>
                  <span style={{ width:22,height:22,borderRadius:"50%",background:T.red,color:T.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>{idx+1}</span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:13,color:T.black }}>{entry.name||<span style={{ color:T.grey500,fontStyle:"italic" }}>Name auto-detect</span>}</div>
                    <div style={{ fontSize:11.5,color:T.grey500,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{entry.fileName}</div>
                  </div>
                  <button onClick={()=>removeFromQueue(entry.id)}
                    style={{ width:28,height:28,borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}
                    onMouseEnter={(e)=>{e.currentTarget.style.background=T.redLight;e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>
                    <X size={13}/>
                  </button>
                </div>
              ))}
              <button onClick={handleMatchAll} disabled={uploading||!gpsUploadEnabled}
                style={{ marginTop:4,padding:"10px 20px",background:uploading||!gpsUploadEnabled?"#ccc":T.green,color:T.white,border:"none",borderRadius:8,fontSize:13.5,fontWeight:700,fontFamily:"inherit",cursor:uploading||!gpsUploadEnabled?"not-allowed":"pointer",whiteSpace:"nowrap",alignSelf:"flex-start",display:"inline-flex",alignItems:"center",gap:7 }}>
                {uploading ? "Processing…" : `Upload & Match All (${entries.length} file${entries.length>1?"s":""})`}
              </button>
            </div>
          )}

          {uploadMsg && (
            <div style={{ marginTop:12,padding:"9px 14px",borderRadius:8,fontSize:13,fontWeight:500,background:uploadMsg.type==="success"?T.greenBg:T.redLight,color:uploadMsg.type==="success"?T.green:T.red,border:`1px solid ${uploadMsg.type==="success"?"rgba(21,128,61,0.2)":"rgba(204,0,0,0.2)"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10 }}>
              <span>{uploadMsg.text}</span>
              {uploadMsg.type==="success"&&activeReport&&(
                <button onClick={downloadExcel} style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,background:T.green,color:"#fff",border:"none",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0 }}>
                  <Download size={12}/> Download Excel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent uploads ────────────────────────────────────────── */}
      <div style={card}>
        <div style={cardHeader}><p style={cardTitle}>Recent Uploads</p></div>
        {reports.length===0 ? (
          <div style={{ textAlign:"center",padding:40,color:T.grey500,fontSize:13 }}>No uploads yet. Upload GPS reports to begin.</div>
        ) : reports.slice(0,5).map((r)=>(
          <div key={r.id} onClick={()=>{setActiveReport(r);setSearch("");setStatusFilter("");}}
            style={{ display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderBottom:`1px solid ${T.border}`,cursor:"pointer" }}
            onMouseEnter={(e)=>(e.currentTarget.style.background=T.grey100)}
            onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>
            <MapPin size={15} color={T.red} style={{ flexShrink:0 }}/>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontWeight:600,fontSize:13.5,color:T.black }}>{r.fileName}</div>
              <div style={{ fontSize:11.5,color:T.grey500,marginTop:2 }}>{r.uploadedBy} · {r.createdAt} · {r.totalRows} rows</div>
            </div>
            <span style={{ fontSize:11.5,fontWeight:600,padding:"3px 10px",borderRadius:99,background:T.greenBg,color:T.green,border:"1px solid rgba(21,128,61,0.2)",whiteSpace:"nowrap" }}>✔ {r.hasOdSurvey ? r.rows.filter(row=>row.matched&&row.odVerified).length : r.matchedCount} {r.hasOdSurvey ? "3-Way Verified" : "Verified"}</span>
            <button onClick={(e)=>deleteReport(r.id,e)}
              style={{ width:30,height:30,borderRadius:7,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}
              onMouseEnter={(e)=>{e.currentTarget.style.background=T.redLight;e.currentTarget.style.color=T.red;e.currentTarget.style.borderColor=T.red;}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.grey500;e.currentTarget.style.borderColor=T.border;}}>
              <Trash2 size={13}/>
            </button>
          </div>
        ))}
      </div>

      {/* ── Report detail ─────────────────────────────────────────── */}
      {activeReport && (
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <p style={cardTitle}>{activeReport.fileName}</p>
              <p style={{ margin:"3px 0 0",fontSize:11.5,color:T.grey500 }}>{activeReport.createdAt} · {activeReport.totalRows} rows · {activeReportHasOd ? activeReport.rows.filter(row=>row.matched&&row.odVerified).length : activeReport.matchedCount} {activeReportHasOd ? "3-Way Verified" : "verified"}</p>
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={downloadExcel}
                style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:`1px solid ${T.red}`,background:"transparent",color:T.red,fontSize:12.5,fontWeight:600,fontFamily:"inherit",cursor:"pointer" }}
                onMouseEnter={(e)=>(e.currentTarget.style.background=T.redLight)}
                onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>
                <Download size={13}/> Download Excel
              </button>
              <button onClick={()=>setActiveReport(null)}
                style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.grey500,fontSize:12.5,fontWeight:600,fontFamily:"inherit",cursor:"pointer" }}
                onMouseEnter={(e)=>(e.currentTarget.style.background=T.grey100)}
                onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>
                Close
              </button>
            </div>
          </div>

          {activeReport.formType !== "od-operation" && <div style={{ padding:"12px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
            <div style={{ flex:1,minWidth:200,position:"relative",display:"flex",alignItems:"center" }}>
              <Search size={14} color={T.grey500} style={{ position:"absolute",left:10,pointerEvents:"none" }}/>
              <input type="text" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search name, site, district…"
                style={{ width:"100%",padding:"7px 10px 7px 32px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none",background:"#fafafa",color:T.black }}
                onFocus={(e)=>(e.target.style.borderColor=T.red)} onBlur={(e)=>(e.target.style.borderColor=T.border)}/>
            </div>
            <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}
              style={{ padding:"7px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none",background:"#fafafa",color:T.black,cursor:"pointer" }}>
              <option value="">{activeReportHasOd ? "3-Way Verified (default)" : "All Statuses"}</option>
              {activeReportHasOd && <option value="3-Way Verified">3-Way Verified only</option>}
            </select>
            <span style={{ fontSize:12,color:T.grey500,whiteSpace:"nowrap" }}>{displayRows.length} of {activeReport.rows.length} rows</span>
          </div>}

          {activeReport.formType !== "od-operation" && <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ background:T.red }}>
                  {["#","Person","Site ID","Site Name","Circle","Employee GPS → Master GPS",
                    ...(activeReport.hasOdSurvey?["OD Survey GPS"]:[]),
                    "Gap to Site","Time","Status"].map((h)=>(
                    <th key={h} style={{ padding:"10px 13px",textAlign:"left",color:T.white,fontWeight:600,fontSize:11.5,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length===0 ? (
                  <tr><td colSpan={activeReport.hasOdSurvey?10:9} style={{ textAlign:"center",padding:40,color:T.grey500,fontSize:13 }}>No results.</td></tr>
                ) : displayRows.map((r, idx)=>{
                  const dispNum  = idx + 1;
                  const hasOdCol = activeReport.hasOdSurvey;
                  const colSpan  = hasOdCol ? 10 : 9;
                  // OD mismatch rows: special red row
                  if (r.odMismatch) {
                    return (
                      <tr key={`odm-${r.rowNumber}`} style={{ borderBottom:`1px solid ${T.border}`, background:"rgba(220,38,38,0.03)" }}
                        onMouseEnter={(e)=>(e.currentTarget.style.background="rgba(220,38,38,0.07)")}
                        onMouseLeave={(e)=>(e.currentTarget.style.background="rgba(220,38,38,0.03)")}>
                        <td style={{ padding:"10px 13px",color:T.grey500,fontSize:12 }}>{dispNum}</td>
                        <td style={{ padding:"10px 13px",fontWeight:600,color:T.black,whiteSpace:"nowrap" }}>{r.personName}</td>
                        <td style={{ padding:"10px 13px",fontFamily:"monospace",fontSize:12,color:T.red,fontWeight:600 }}>{r.matchedSiteId||"–"}</td>
                        <td colSpan={colSpan - 3} style={{ padding:"10px 13px",color:T.red,fontSize:12 }}>
                          <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                            <span style={{ fontWeight:700 }}>⚠ {r.odMismatchReason}</span>
                            {r.odSurveyLat!=null && <span style={{ fontFamily:"monospace",fontSize:11,color:T.grey500 }}>OD GPS: {r.odSurveyLat.toFixed(5)}, {r.odSurveyLng.toFixed(5)}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const d = fmtDist(r.distanceMeters);
                  return (
                    <tr key={r.rowNumber} style={{ borderBottom:`1px solid ${T.border}` }}
                      onMouseEnter={(e)=>(e.currentTarget.style.background=T.grey100)}
                      onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>
                      <td style={{ padding:"10px 13px",color:T.grey500,fontSize:12 }}>{dispNum}</td>
                      <td style={{ padding:"10px 13px",fontWeight:600,color:T.black,whiteSpace:"nowrap" }}>{r.personName}</td>
                      <td style={{ padding:"10px 13px",fontFamily:"monospace",fontSize:12,color:T.grey500 }}>{r.matchedSiteId||"–"}</td>
                      <td style={{ padding:"10px 13px",color:T.black }}>{r.matchedSiteName||"–"}</td>
                      <td style={{ padding:"10px 13px",fontSize:12,color:T.grey500 }}>{r.circle||"–"}</td>
                      <td style={{ padding:"10px 13px" }}>
                        <div style={{ display:"flex",flexDirection:"column",gap:2,fontFamily:"monospace",fontSize:11.5,minWidth:260 }}>
                          <span style={{ color:T.blue,fontWeight:600 }}>{r.userLat!=null?`${r.userLat.toFixed(5)}, ${r.userLng.toFixed(5)}`:"–"}</span>
                          <span style={{ color:T.grey500,fontSize:10.5,fontFamily:"'DM Sans',sans-serif",maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}
                            title={r.masterFileName?`${r.masterFileName} · Row ${r.masterRowNum} · ${r.masterLatCol}/${r.masterLngCol}`:(r.masterSource||"")}>
                            ↕ {r.masterFileName
                              ? `${r.masterFileName} · Row ${r.masterRowNum}${r.masterLatCol?` · ${r.masterLatCol}/${r.masterLngCol}`:""}`
                              : (r.masterSource||"–")}
                          </span>
                          <span style={{ color:T.green }}>{r.masterLat!=null?`${r.masterLat.toFixed(5)}, ${r.masterLng.toFixed(5)}`:"–"}</span>
                        </div>
                      </td>
                      {(activeReport.hasOdSurvey) && (
                        <td style={{ padding:"10px 13px" }}>
                          {r.odSurveyLat != null ? (
                            <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                              <span style={{ color:T.purple,fontFamily:"monospace",fontSize:11.5,fontWeight:600 }}>
                                {r.odSurveyLat.toFixed(5)}, {r.odSurveyLng.toFixed(5)}
                              </span>
                              <span style={{ fontSize:10.5,color:T.green,fontWeight:600 }}>✔ OD Verified</span>
                            </div>
                          ) : (
                            <span style={{ fontSize:11.5,color:T.grey500 }}>–</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding:"10px 13px" }}>
                        {d?<span style={{ padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:600,background:r.matched?T.blueBg:T.redLight,color:r.matched?T.blue:T.red }}>{d}</span>:"–"}
                      </td>
                      <td style={{ padding:"10px 13px",fontSize:12,color:T.grey500,whiteSpace:"nowrap" }}>{fmtTime(r.timeOfVisit)}</td>
                      <td style={{ padding:"10px 13px" }}><StatusPill status={r.status} odVerified={r.odVerified} hasOd={activeReport.hasOdSurvey}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* ── OD Operation GPS Results ───────────────────────────────── */}
      {activeReport?.hasOdOp && activeReport.odOpRows?.length > 0 && (
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <p style={cardTitle}>OD Operation Form Results</p>
              <p style={{ margin:"3px 0 0",fontSize:11.5,color:T.grey500 }}>
                {activeReport.odOpRows.length} entries · {activeReport.odOpRows.filter(r=>r.gpsVerified).length} GPS Verified
              </p>
            </div>
            <button onClick={downloadOdOpReport}
              style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.blue,fontSize:13,fontWeight:600,fontFamily:"inherit",cursor:"pointer" }}
              onMouseEnter={(e)=>{e.currentTarget.style.background=T.blueBg;}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";}}>
              <Download size={13}/> Download Excel
            </button>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ background:"#0369a1" }}>
                  {["#","Person","Nominal (Site ID)","Site Name","Employee GPS → Master GPS","Match Source","Gap","Time/Date","Incident Remark","Resolved","Status"].map(h=>(
                    <th key={h} style={{ padding:"10px 13px",textAlign:"left",color:"#fff",fontWeight:600,fontSize:11.5,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeReport.odOpRows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom:`1px solid ${T.border}`,background:"transparent" }}
                    onMouseEnter={(e)=>(e.currentTarget.style.background=T.grey100)}
                    onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>
                    <td style={{ padding:"10px 13px",color:T.grey500,fontSize:12 }}>{idx+1}</td>
                    <td style={{ padding:"10px 13px",fontWeight:600,whiteSpace:"nowrap" }}>{r.userName||"—"}</td>
                    <td style={{ padding:"10px 13px",fontFamily:"monospace",fontSize:12,color:r.matched?T.blue:T.red,fontWeight:600 }}>{r.nominal}</td>
                    <td style={{ padding:"10px 13px",fontSize:12 }}>{r.siteName||"—"}</td>
                    <td style={{ padding:"10px 13px",fontSize:11.5 }}>
                      {r.gpsVerified && r.closestPing ? (
                        <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                          <span style={{ color:T.blue,fontFamily:"monospace" }}>{r.closestPing.lat.toFixed(5)}, {r.closestPing.lng.toFixed(5)}</span>
                          <span style={{ color:T.green,fontFamily:"monospace" }}>{r.siteLat?.toFixed(5)}, {r.siteLng?.toFixed(5)}</span>
                        </div>
                      ) : r.matched ? <span style={{ color:T.grey500,fontSize:11 }}>No GPS ping near site</span> : "—"}
                    </td>
                    <td style={{ padding:"10px 13px",fontSize:11,color:T.grey500 }}>
                      {r.matched && r.masterFileName ? `${r.masterFileName} · Row ${r.masterRowNum} · ${r.latColName}/${r.lngColName}` : "—"}
                    </td>
                    <td style={{ padding:"10px 13px" }}>
                      {r.gpsDist != null
                        ? <span style={{ padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:600,background:r.gpsVerified?T.blueBg:T.redLight,color:r.gpsVerified?T.blue:T.red }}>
                            {r.gpsDist < 1000 ? r.gpsDist + " m" : (r.gpsDist/1000).toFixed(1) + " km"}
                          </span>
                        : "—"}
                    </td>
                    <td style={{ padding:"10px 13px",fontSize:12,color:T.grey500,whiteSpace:"nowrap" }}>{r.timeStr||"—"}</td>
                    <td style={{ padding:"10px 13px",fontSize:12 }}>{r.remark||"—"}</td>
                    <td style={{ padding:"10px 13px" }}>
                      <span style={{ padding:"2px 8px",borderRadius:4,fontSize:11.5,fontWeight:600,
                        background:r.resolved?.toLowerCase()==="yes"?"rgba(21,128,61,0.08)":"rgba(220,38,38,0.08)",
                        color:r.resolved?.toLowerCase()==="yes"?T.green:T.red }}>
                        {r.resolved||"—"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 13px" }}>
                      {!r.matched
                        ? <span style={{ padding:"2px 8px",borderRadius:4,fontSize:11.5,fontWeight:600,background:"rgba(220,38,38,0.08)",color:T.red }}>✘ Not in Master</span>
                        : r.gpsVerified
                          ? <span style={{ padding:"2px 8px",borderRadius:4,fontSize:11.5,fontWeight:600,background:"rgba(21,128,61,0.08)",color:T.green }}>✔ Site Visited</span>
                          : <span style={{ padding:"2px 8px",borderRadius:4,fontSize:11.5,fontWeight:600,background:"rgba(220,38,38,0.08)",color:T.red }}>✘ {r.gpsStatus}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
