import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Search, Download, Trash2, MapPin,
  CheckCircle, XCircle, Clock, Navigation2,
} from "lucide-react";

/* ── Design tokens (match App.js) ─────────────────────────────── */
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
};

const TOLERANCE = 50; // metres
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
  const headers = rows[2].map((h) =>
    String(h || "").trim().toLowerCase().replace(/\r?\n/g, " ")
  );
  const ci = makeCi(headers);
  const iId   = ci("stpl site id", "site id");
  const iName = ci("site name");
  const iCirc = ci("circle name", "circle");
  const iDist = ci("district");
  const iLat  = ci("latitude");
  const iLng  = ci("longitude");
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
    });
  }
  return map;
}

function parseLLSheet(ws, map) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) return;
  const headers = rows[0].map((h) =>
    String(h || "").trim().toLowerCase().replace(/\r?\n/g, " ")
  );
  const ci   = makeCi(headers);
  const iId  = ci("sts site id", "stpl site id", "site id");
  const iName = ci("site name");
  const iCirc = ci("circle name", "circle");
  const iDist = ci("district");
  const iLat  = ci("lat", "latitude");
  const iLng  = ci("long", "longitude");
  if (iId === -1 || iLat === -1 || iLng === -1) return;
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
      source: "Site Lat/Long",
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

/* ═══════════════════════════════════════════════════════════════ */
/*  Main Component                                                 */
/* ═══════════════════════════════════════════════════════════════ */
export default function SiteVisit() {
  const [masterSites, setMasterSites]   = useState([]);
  const [masterLabel, setMasterLabel]   = useState("Loading master…");
  const [masterReady, setMasterReady]   = useState(false);
  const [reports, setReports]           = useState(() =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
  );
  const [activeReport, setActiveReport] = useState(null);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [personName, setPersonName]     = useState("");
  const [fileName, setFileName]         = useState("");
  const [uploadMsg, setUploadMsg]       = useState(null);
  const [uploading, setUploading]       = useState(false);
  const fileRef = useRef(null);

  /* ── Load masters on mount ──────────────────────────────────── */
  useEffect(() => { loadMasters(); }, []); // eslint-disable-line

  async function loadMasters() {
    /* Serve from cache instantly */
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { pan, ll } = JSON.parse(cached);
        const sites = buildMergedArray(new Map(pan), new Map(ll));
        setMasterSites(sites);
        setMasterLabel(`✔ ${sites.length} Sites Loaded`);
        setMasterReady(true);
      }
    } catch (_) {}

    /* Refresh from files */
    try {
      const [panBuf, llBuf] = await Promise.all([
        fetch("/pan-india-master.xlsb").then((r) => {
          if (!r.ok) throw new Error("pan-india-master.xlsb not found in public/");
          return r.arrayBuffer();
        }),
        fetch("/site-latlong-master.xlsx").then((r) => {
          if (!r.ok) throw new Error("site-latlong-master.xlsx not found in public/");
          return r.arrayBuffer();
        }),
      ]);
      const panWb = XLSX.read(new Uint8Array(panBuf), { type: "array" });
      const llWb  = XLSX.read(new Uint8Array(llBuf),  { type: "array" });
      const panMap = parsePanIndia(panWb.Sheets["Site master"]);
      const llMap  = parseSiteLatLong(llWb);
      const sites  = buildMergedArray(panMap, llMap);
      setMasterSites(sites);
      setMasterLabel(`✔ ${sites.length} Sites Loaded`);
      setMasterReady(true);
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        pan: [...panMap.entries()],
        ll:  [...llMap.entries()],
      }));
    } catch (err) {
      if (!masterReady) setMasterLabel("⚠ Master load failed");
      console.error("SiteVisit master load:", err);
    }
  }

  /* ── Persist reports ────────────────────────────────────────── */
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

  /* ── Upload & match ─────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    const file = fileRef.current?.files[0];
    if (!file || !masterReady) return;
    setUploading(true);
    setUploadMsg(null);

    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(new Uint8Array(buf), { type: "array" });

      /* Pick the sheet that has GPS data */
      const gpsRe = /(\d{1,3}\.\d+)\s*,\s*(\d{1,3}\.\d+)/;
      let ws = wb.Sheets[wb.SheetNames[0]];
      for (const sheetName of wb.SheetNames) {
        const sample = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
          header: 1, defval: "",
        }).slice(0, 60);
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
      if (rows.length < 2) throw new Error("File has no data rows");

      /* Auto-detect real header row */
      const HDR_KW = ["lat","long","lng","gps","name","employee","person",
                      "staff","date","time","id","site","status","tracker"];
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(rows.length, 8); r++) {
        const cells    = rows[r].map((c) => String(c || "").trim().toLowerCase());
        const nonEmpty = cells.filter(Boolean).length;
        const hits     = cells.filter((c) => HDR_KW.some((k) => c.includes(k))).length;
        if (nonEmpty >= 3 && hits >= 2) { headerRowIdx = r; break; }
      }

      const headers = rows[headerRowIdx].map((h) =>
        String(h || "").trim().toLowerCase()
      );
      const ci = makeCi(headers);

      const colTime    = ci("time (gmt", "time", "timestamp", "date");
      const colTracker = ci("tracker_id", "tracker", "device");
      const colPerson  = ci("full name", "employee name", "staff name", "person name",
                            "person", "name", "employee", "user", "field", "engineer");
      const colRemark  = ci("validated remark", "remark", "validated", "status", "attendance");

      /* Detect coordinate columns */
      let colLat = ci("latitude", "lat");
      let colLng = ci("longitude", "lon", "long");
      let colCombined = -1;

      if (colLat !== -1 && colLng !== -1 && colLat !== colLng) {
        const samp = rows.slice(headerRowIdx + 1, headerRowIdx + 11);
        const tLat = parseFloat(String(
          samp.map((r) => r[colLat]).find((v) => String(v || "").trim()) || ""
        ));
        const tLng = parseFloat(String(
          samp.map((r) => r[colLng]).find((v) => String(v || "").trim()) || ""
        ));
        if (isNaN(tLat) || isNaN(tLng) || tLat < 6 || tLat > 38 || tLng < 60 || tLng > 100) {
          colLat = -1; colLng = -1;
        }
      } else {
        colLat = -1; colLng = -1;
      }

      if (colLat === -1 || colLng === -1) {
        const numCols  = rows[headerRowIdx]?.length || 0;
        const scanEnd  = Math.min(rows.length, headerRowIdx + 200);
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
        throw new Error(`No GPS columns found. Columns detected: ${preview || "(none)"}`);
      }

      /* Detect mode: productivity report vs raw GPS tracker */
      const allData = rows.slice(headerRowIdx + 1)
        .filter((r) => r.some((c) => String(c || "").trim()));
      const nameSet = new Set();
      if (colPerson !== -1)
        allData.forEach((r) => {
          const n = String(r[colPerson] || "").trim();
          if (n) nameSet.add(n);
        });
      const isProductivity = nameSet.size > 1 && nameSet.size / allData.length >= 0.4;

      const manualName = personName.trim();
      const resultRows = [];
      let matchedCount = 0;

      /* ── PRODUCTIVITY MODE ─────────────────────────────────── */
      if (isProductivity) {
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r.some((c) => String(c || "").trim())) continue;

          const pName = (colPerson !== -1 ? String(r[colPerson] || "").trim() : "")
            || manualName || "Unknown";
          const fileStatus = colRemark !== -1 ? String(r[colRemark] || "").trim() : "";

          let rowLat = null, rowLng = null;
          if (colLat !== -1 && colLng !== -1) {
            const la = parseFloat(r[colLat]), lo = parseFloat(r[colLng]);
            if (!isNaN(la) && !isNaN(lo) && la && lo) { rowLat = la; rowLng = lo; }
          } else if (colCombined !== -1) {
            const coords = extractCoords(r[colCombined]);
            if (coords.length) { rowLat = coords[0].lat; rowLng = coords[0].lng; }
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
          const status = rowLat === null
            ? (fileStatus || "No GPS")
            : (verified ? "Work Done - Verified" : "Not at Master Site");

          resultRows.push({
            rowNumber:       resultRows.length + 1,
            personName:      pName,
            timeOfVisit:     "",
            userLat:         rowLat,
            userLng:         rowLng,
            matchedSiteId:   nearestSite?.stsId   || "",
            matchedSiteName: nearestSite?.name    || "",
            district:        nearestSite?.dist    || "",
            circle:          nearestSite?.circle  || "",
            masterSource:    nearestSite?.source  || "",
            masterLat:       nearestSite?.lat     ?? null,
            masterLng:       nearestSite?.lng     ?? null,
            distanceMeters:  nearestDist !== Infinity ? Math.round(nearestDist) : null,
            matched:         verified,
            status,
          });
        }

      /* ── GPS TRACKER MODE ──────────────────────────────────── */
      } else {
        const pingsByPerson = new Map();
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const r    = rows[i];
          const time = colTime !== -1 ? String(r[colTime] || "") : "";
          let rPerson = manualName;
          if (!rPerson) {
            if (colPerson !== -1 && String(r[colPerson] || "").trim())
              rPerson = String(r[colPerson]).trim();
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
        if (!totalPings) throw new Error("No valid GPS coordinates found in the uploaded file");

        for (const [pName, pings] of pingsByPerson) {
          for (const site of masterSites) {
            let nearestDist = Infinity, nearestTime = "", nearestLat = null, nearestLng = null;
            const degTol = TOLERANCE / 111000;
            for (const ping of pings) {
              if (Math.abs(ping.lat - site.lat) > degTol) continue;
              if (Math.abs(ping.lng - site.lng) > degTol) continue;
              const d = haversineMeters(ping.lat, ping.lng, site.lat, site.lng);
              if (d < nearestDist) {
                nearestDist = d; nearestTime = ping.time;
                nearestLat = ping.lat; nearestLng = ping.lng;
              }
            }
            if (nearestDist > TOLERANCE) continue;
            matchedCount++;
            resultRows.push({
              rowNumber:       matchedCount,
              personName:      pName,
              timeOfVisit:     nearestTime,
              userLat:         nearestLat,
              userLng:         nearestLng,
              matchedSiteId:   site.stsId,
              matchedSiteName: site.name,
              district:        site.dist,
              circle:          site.circle,
              masterSource:    site.source,
              masterLat:       site.lat,
              masterLng:       site.lng,
              distanceMeters:  Math.round(nearestDist),
              matched:         true,
              status:          "Work Done - Verified",
            });
          }
        }
      }

      const label = isProductivity
        ? `${nameSet.size} persons`
        : (manualName || ([...new Set(resultRows.map((r) => r.personName))][0]) || "Unknown");

      const report = {
        id:           Date.now().toString(),
        fileName:     file.name,
        uploadedBy:   label,
        createdAt:    new Date().toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }),
        matchedCount,
        totalRows:    resultRows.length,
        rows:         resultRows,
      };

      const all = [report, ...reports].slice(0, 20);
      persistReports(all);
      setActiveReport(report);
      setSearch(""); setStatusFilter("");
      setUploadMsg({
        text: `Done — ${resultRows.length} rows · ${matchedCount} Verified`,
        type: "success",
      });
      if (fileRef.current) { fileRef.current.value = ""; setFileName(""); }

    } catch (err) {
      setUploadMsg({ text: "Error: " + err.message, type: "error" });
    }
    setUploading(false);
  }

  /* ── Download Excel ─────────────────────────────────────────── */
  function downloadExcel() {
    if (!activeReport) return;
    const hdrs = ["#","Person Name","Site ID","Site Name","District","Circle",
                  "Person GPS","Master GPS","Gap to Site","Time","Status"];
    const data = activeReport.rows.map((r) => [
      r.rowNumber,
      r.personName,
      r.matchedSiteId     || "",
      r.matchedSiteName   || "",
      r.district          || "",
      r.circle            || "",
      r.userLat   != null ? `${r.userLat.toFixed(6)}, ${r.userLng.toFixed(6)}`     : "",
      r.masterLat != null ? `${r.masterLat.toFixed(6)}, ${r.masterLng.toFixed(6)}` : "",
      r.distanceMeters != null
        ? (r.distanceMeters < 1000 ? r.distanceMeters + " m" : (r.distanceMeters / 1000).toFixed(1) + " km")
        : "",
      r.timeOfVisit || "",
      r.status      || "",
    ]);
    const xlWs = XLSX.utils.aoa_to_sheet([hdrs, ...data]);
    xlWs["!cols"] = [5, 22, 22, 28, 18, 14, 26, 26, 13, 18, 22].map((wch) => ({ wch }));
    const xlWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(xlWb, xlWs, "Verification");
    XLSX.writeFile(xlWb, activeReport.fileName.replace(/\.[^.]+$/, "") + "_verified.xlsx");
  }

  /* ── Filtered rows ──────────────────────────────────────────── */
  const displayRows = activeReport
    ? activeReport.rows.filter((r) => {
        const hay = `${r.personName} ${r.matchedSiteId} ${r.matchedSiteName} ${r.district} ${r.circle}`.toLowerCase();
        return (
          (!search || hay.includes(search.toLowerCase())) &&
          (!statusFilter || r.status === statusFilter)
        );
      })
    : [];

  /* ── Status pill ────────────────────────────────────────────── */
  function StatusPill({ status }) {
    if (status === "Work Done - Verified")
      return (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 10px", borderRadius: 99,
          background: T.greenBg, color: T.green,
          border: "1px solid rgba(21,128,61,0.2)",
          fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          <CheckCircle size={11} /> Verified
        </span>
      );
    if (status === "Not at Master Site")
      return (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 10px", borderRadius: 99,
          background: T.orangeBg, color: T.orange,
          border: "1px solid rgba(194,65,12,0.2)",
          fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          <XCircle size={11} /> Not at Site
        </span>
      );
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 10px", borderRadius: 99,
        background: "#f3f4f6", color: "#4b5563",
        border: "1px solid #e5e7eb",
        fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
      }}>
        <Clock size={11} /> {status}
      </span>
    );
  }

  /* ── Render ─────────────────────────────────────────────────── */
  const card = {
    background: T.white,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };
  const cardHeader = {
    padding: "14px 20px",
    borderBottom: `1px solid ${T.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-between",
  };
  const cardTitle = { margin: 0, fontSize: 14, fontWeight: 700, color: T.black };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Page header ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: T.redLight, border: "1px solid rgba(204,0,0,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Navigation2 size={18} color={T.red} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.black, letterSpacing: "-0.4px" }}>
              User Site Visit
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.grey500, marginTop: 2 }}>
              Verify field visits against master site coordinates (50 m radius)
            </p>
          </div>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600,
          padding: "4px 12px", borderRadius: 99,
          background: masterReady ? T.greenBg : T.redLight,
          color:      masterReady ? T.green   : T.red,
          border:     `1px solid ${masterReady ? "rgba(21,128,61,0.2)" : "rgba(204,0,0,0.2)"}`,
        }}>
          {masterLabel}
        </span>
      </div>

      {/* ── Upload panel ─────────────────────────────────────── */}
      <div style={card}>
        <div style={cardHeader}>
          <p style={cardTitle}>Upload GPS Report</p>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{
            fontSize: 12, color: T.grey500,
            background: T.grey100, borderLeft: `3px solid ${T.red}`,
            borderRadius: "0 6px 6px 0", padding: "8px 12px", marginBottom: 16,
          }}>
            Upload a field person's GPS tracker or daily productivity report (.xlsx / .xls / .csv).
            Each person's GPS is matched against master sites — <strong>verified if within 50 m</strong>.
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* Person name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.grey500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Person's Name
              </label>
              <input
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Optional — auto-detected"
                style={{
                  padding: "8px 11px", border: `1px solid ${T.border}`,
                  borderRadius: 8, fontSize: 13, fontFamily: "inherit",
                  color: T.black, background: "#fafafa", outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = T.red)}
                onBlur={(e)  => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* File picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.grey500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                GPS Report File
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px",
                border: `1px dashed ${T.red}`,
                borderRadius: 8, cursor: "pointer",
                background: T.redLight, color: T.red,
                fontSize: 13, fontWeight: 500,
              }}>
                <Upload size={15} />
                <span>{fileName || "Choose file…"}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  required
                  style={{ display: "none" }}
                  onChange={(e) => setFileName(e.target.files[0]?.name || "")}
                />
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={uploading || !masterReady}
              style={{
                padding: "9px 18px",
                background: uploading || !masterReady ? "#ccc" : T.red,
                color: T.white, border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                cursor: uploading || !masterReady ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {uploading ? "Processing…" : "Upload & Match"}
            </button>
          </form>

          {uploadMsg && (
            <div style={{
              marginTop: 12, padding: "9px 14px", borderRadius: 8,
              fontSize: 13, fontWeight: 500,
              background: uploadMsg.type === "success" ? T.greenBg : T.redLight,
              color:      uploadMsg.type === "success" ? T.green   : T.red,
              border:     `1px solid ${uploadMsg.type === "success" ? "rgba(21,128,61,0.2)" : "rgba(204,0,0,0.2)"}`,
            }}>
              {uploadMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent uploads ───────────────────────────────────── */}
      <div style={card}>
        <div style={cardHeader}>
          <p style={cardTitle}>Recent Uploads</p>
        </div>
        {reports.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: T.grey500, fontSize: 13 }}>
            No uploads yet. Upload a GPS report to begin.
          </div>
        ) : (
          reports.slice(0, 5).map((r) => (
            <div
              key={r.id}
              onClick={() => { setActiveReport(r); setSearch(""); setStatusFilter(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "13px 20px",
                borderBottom: `1px solid ${T.border}`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.grey100)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <MapPin size={15} color={T.red} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: T.black }}>{r.fileName}</div>
                <div style={{ fontSize: 11.5, color: T.grey500, marginTop: 2 }}>
                  By {r.uploadedBy} · {r.createdAt} · {r.totalRows} rows
                </div>
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                background: T.greenBg, color: T.green,
                border: "1px solid rgba(21,128,61,0.2)", whiteSpace: "nowrap",
              }}>
                ✔ {r.matchedCount} Verified
              </span>
              <button
                onClick={(e) => deleteReport(r.id, e)}
                style={{
                  width: 30, height: 30, borderRadius: 7,
                  border: `1px solid ${T.border}`, background: "transparent",
                  color: T.grey500, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.redLight; e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.grey500; e.currentTarget.style.borderColor = T.border; }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Report detail ─────────────────────────────────────── */}
      {activeReport && (
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <p style={cardTitle}>{activeReport.fileName}</p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.grey500 }}>
                {activeReport.createdAt} · {activeReport.totalRows} rows · {activeReport.matchedCount} verified
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={downloadExcel}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 8,
                  border: `1px solid ${T.red}`, background: "transparent",
                  color: T.red, fontSize: 12.5, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.redLight)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Download size={13} /> Download Excel
              </button>
              <button
                onClick={() => setActiveReport(null)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "7px 14px", borderRadius: 8,
                  border: `1px solid ${T.border}`, background: "transparent",
                  color: T.grey500, fontSize: 12.5, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.grey100)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Close
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{
            padding: "12px 20px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
          }}>
            <div style={{ flex: 1, minWidth: 200, position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} color={T.grey500} style={{ position: "absolute", left: 10, pointerEvents: "none" }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, site, district…"
                style={{
                  width: "100%", padding: "7px 10px 7px 32px",
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  fontSize: 13, fontFamily: "inherit", outline: "none",
                  background: "#fafafa", color: T.black,
                }}
                onFocus={(e) => (e.target.style.borderColor = T.red)}
                onBlur={(e)  => (e.target.style.borderColor = T.border)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "7px 12px", border: `1px solid ${T.border}`,
                borderRadius: 8, fontSize: 13, fontFamily: "inherit",
                outline: "none", background: "#fafafa", color: T.black, cursor: "pointer",
              }}
            >
              <option value="">All Statuses</option>
              <option value="Work Done - Verified">Work Done, Verified</option>
              <option value="Not at Master Site">Not at Master Site</option>
            </select>
            <span style={{ fontSize: 12, color: T.grey500, whiteSpace: "nowrap" }}>
              {displayRows.length} of {activeReport.rows.length} rows
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.red }}>
                  {["#","Person","Site ID","Site Name","District","Circle",
                    "Person GPS → Master GPS","Gap to Site","Time","Status"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 13px", textAlign: "left",
                      color: T.white, fontWeight: 600, fontSize: 11.5,
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 40, color: T.grey500, fontSize: 13 }}>
                      No results.
                    </td>
                  </tr>
                ) : displayRows.map((r) => {
                  const d = fmtDist(r.distanceMeters);
                  return (
                    <tr key={r.rowNumber}
                      style={{ borderBottom: `1px solid ${T.border}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = T.grey100)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "10px 13px", color: T.grey500, fontSize: 12 }}>{r.rowNumber}</td>
                      <td style={{ padding: "10px 13px", fontWeight: 600, color: T.black, whiteSpace: "nowrap" }}>{r.personName}</td>
                      <td style={{ padding: "10px 13px", fontFamily: "monospace", fontSize: 12, color: T.grey500 }}>{r.matchedSiteId || "–"}</td>
                      <td style={{ padding: "10px 13px", color: T.black }}>{r.matchedSiteName || "–"}</td>
                      <td style={{ padding: "10px 13px", fontSize: 12, color: T.grey500 }}>{r.district || "–"}</td>
                      <td style={{ padding: "10px 13px", fontSize: 12, color: T.grey500 }}>{r.circle || "–"}</td>
                      <td style={{ padding: "10px 13px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "monospace", fontSize: 11.5, minWidth: 220 }}>
                          <span style={{ color: T.blue, fontWeight: 600 }}>
                            {r.userLat != null ? `${r.userLat.toFixed(5)}, ${r.userLng.toFixed(5)}` : "–"}
                          </span>
                          <span style={{ color: T.grey500, fontSize: 11 }}>↕ {r.masterSource || "–"}</span>
                          <span style={{ color: T.green }}>
                            {r.masterLat != null ? `${r.masterLat.toFixed(5)}, ${r.masterLng.toFixed(5)}` : "–"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 13px" }}>
                        {d ? (
                          <span style={{
                            padding: "2px 8px", borderRadius: 4,
                            fontSize: 12, fontWeight: 600,
                            background: r.matched ? T.blueBg : T.redLight,
                            color:      r.matched ? T.blue   : T.red,
                          }}>{d}</span>
                        ) : "–"}
                      </td>
                      <td style={{ padding: "10px 13px", fontSize: 12, color: T.grey500, whiteSpace: "nowrap" }}>{r.timeOfVisit || "–"}</td>
                      <td style={{ padding: "10px 13px" }}><StatusPill status={r.status} /></td>
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
