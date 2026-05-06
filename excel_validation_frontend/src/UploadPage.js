import React, { useState, useEffect } from "react";
import { Upload, CheckCircle2, FileSpreadsheet, Loader2, AlertTriangle, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { fileStore } from "./utils/fileStore";

const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  redBg:    "rgba(204,0,0,0.07)",
  black:    "#111111",
  grey200:  "#E4E4E7",
  grey100:  "#F4F4F5",
  white:    "#FFFFFF",
  muted:    "#71717A",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.08)",
  overlay:  "rgba(0,0,0,0.45)",
  orange:   "#D97706",
  orangeBg: "rgba(217,119,6,0.08)",
};

// =====================================================
// HARDCODED FORM TYPES (always visible)
// =====================================================
const HARDCODED_FORM_TYPES = [
  "Meeting Form",
  "EB Meter Form",
  "Leave Form",
  "OD Survey Form",
  "Site Survey Checklist",
  "OD Operation Form",
  "FTTH Acquisition Form",
  "Others"
];

// =====================================================
// HELPER — extract a clean form name from filename
// e.g. "LAST_EB_METER_2026-03-05T11_56_04.611Z.xlsx" → "Last Eb Meter"
// =====================================================
function parseFormNameFromFilename(filename) {
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, "");

  // Remove trailing timestamp patterns like _2026-03-05T11_56_04.611Z or _20260305
  name = name
    .replace(/_\d{4}-\d{2}-\d{2}T[\d_:.Z]+$/i, "")
    .replace(/_\d{8,}$/i, "")
    .replace(/[_-]+$/, "");

  // Replace underscores/hyphens with spaces
  name = name.replace(/[_-]+/g, " ").trim();

  // Capital Case
  name = name
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");

  return name || "Custom Form";
}

// =====================================================
// HELPER — read first-row headers from an Excel/CSV file
// Returns a Promise<string[]>
// =====================================================
function readExcelHeaders(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length > 0) {
          const headers = rows[0]
            .map((h) => String(h || "").trim())
            .filter(Boolean);
          resolve(headers);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

/* ─── Labelled field wrapper ─────────────────────────────── */
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: T.black }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ─── Shared input style ─────────────────────────────────── */
function inputStyle(focused) {
  return {
    padding: "10px 12px",
    borderRadius: 9,
    border: `1px solid ${focused ? T.red : T.grey200}`,
    fontSize: 13.5,
    fontFamily: "'DM Sans', sans-serif",
    color: T.black,
    background: focused ? T.white : T.grey100,
    outline: "none",
    width: "100%",
    transition: "all 0.15s ease",
    boxShadow: focused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none",
    boxSizing: "border-box",
  };
}

function FocusInput({ type, value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={inputStyle(focused)}
    />
  );
}

function FocusSelect({ value, onChange, children, disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ...inputStyle(focused), cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {children}
    </select>
  );
}

/* ─── No Rules Modal ─────────────────────────────────────── */
function NoRulesModal({ formName, onDefineRules, onCancel }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: T.overlay,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: 20,
    }}>
      <div style={{
        background: T.white,
        borderRadius: 16,
        padding: "28px 28px 24px",
        maxWidth: 420,
        width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        position: "relative",
        animation: "modalIn 0.18s ease",
      }}>

        {/* Close button */}
        <button
          onClick={onCancel}
          style={{
            position: "absolute", top: 14, right: 14,
            width: 28, height: 28, borderRadius: 7,
            border: `1px solid ${T.grey200}`,
            background: T.grey100,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", padding: 0,
          }}
        >
          <X size={14} color={T.muted} />
        </button>

        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: T.orangeBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          <AlertTriangle size={22} color={T.orange} />
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: 16, fontWeight: 800, color: T.black,
          margin: "0 0 8px", letterSpacing: -0.3,
        }}>
          No Validation Rules Found
        </h3>

        {/* Message */}
        <p style={{ fontSize: 13.5, color: T.muted, margin: "0 0 8px", lineHeight: 1.6 }}>
          We couldn't find any validation rules for{" "}
          <strong style={{ color: T.black }}>"{formName}"</strong>.
        </p>
        <p style={{ fontSize: 13.5, color: T.muted, margin: "0 0 22px", lineHeight: 1.6 }}>
          You need to define the columns and validation rules first before uploading files for this form type.
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>

          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 9,
              border: `1px solid ${T.grey200}`,
              background: T.white,
              color: T.muted,
              fontSize: 13.5, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.grey100; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.white; }}
          >
            Cancel
          </button>

          <button
            onClick={onDefineRules}
            style={{
              flex: 2,
              padding: "10px 0",
              borderRadius: 9,
              border: "none",
              background: T.red,
              color: T.white,
              fontSize: 13.5, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.redDark;
              e.currentTarget.style.transform  = "translateY(-1px)";
              e.currentTarget.style.boxShadow  = "0 6px 18px rgba(204,0,0,0.28)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = T.red;
              e.currentTarget.style.transform  = "none";
              e.currentTarget.style.boxShadow  = "none";
            }}
          >
            Define Rules First
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
function UploadPage() {
  const navigate = useNavigate();

  const [formType, setFormType]         = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [file, setFile]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [dragOver, setDragOver]         = useState(false);

  // Modal state
  const [showModal, setShowModal]       = useState(false);
  const [missingForm, setMissingForm]   = useState("");

  // Dynamic form names from backend (only NEW ones not in hardcoded list)
  const [dynamicForms, setDynamicForms] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/GET-FORM-NAMES")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const newForms = data.filter(
            (f) => !HARDCODED_FORM_TYPES.includes(f)
          );
          setDynamicForms(newForms);
        }
      })
      .catch(() => setDynamicForms([]));
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!formType || !selectedDate || !file) {
      alert("Please complete all fields.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("form_type", formType);
    formData.append("date", selectedDate);

    try {
      const res    = await fetch("http://127.0.0.1:8000/VALIDATE-FORM", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        const errMsg = result.detail || "";

        // ── No rules found → read columns from file → show modal ──
        if (errMsg.toLowerCase().includes("no validation rules found")) {

          // ── Derive a meaningful form name from the uploaded filename ──
          const parsedName = parseFormNameFromFilename(file.name);

          // ── Read the Excel headers and stash them for CreateForm ──
          const headers = await readExcelHeaders(file);
          if (headers.length > 0) {
            sessionStorage.setItem("prefill_columns", JSON.stringify(headers));
          } else {
            sessionStorage.removeItem("prefill_columns");
          }

          fileStore.file = file;
          fileStore.formType = formType;
          fileStore.date = selectedDate;

          setMissingForm(parsedName);
          setShowModal(true);

        } else {
          alert(errMsg || "Upload failed.");
        }

      } else {
        alert(
          `✅ ${result.message || "File uploaded successfully!"}\n\n` +
          `Total: ${result.total_rows}  |  Valid: ${result.valid_rows}  |  Invalid: ${result.junk_rows}`
        );
      }

    } catch {
      alert("Upload failed. Please try again.");
    }

    setLoading(false);
  };

  // ── Redirect to Create Form with form name pre-filled ──
  const handleDefineRules = () => {
    setShowModal(false);
    navigate(`/create-form?form=${encodeURIComponent(missingForm)}`);
  };

  return (
    <>
      {showModal && (
        <NoRulesModal
          formName={missingForm}
          onDefineRules={handleDefineRules}
          onCancel={() => setShowModal(false)}
        />
      )}

      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "calc(100vh - 140px)",
      }}>
        <div style={{ width: "100%", maxWidth: 480 }}>

          <div style={{
            background: T.white,
            borderRadius: 16,
            border: `1px solid ${T.grey200}`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}>

            {/* Header */}
            <div style={{
              padding: "20px 24px 16px",
              borderBottom: `1px solid ${T.grey200}`,
              textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: T.redBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px",
              }}>
                <Upload size={22} color={T.red} />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: T.black, margin: 0 }}>
                Upload Excel File
              </h2>
              <p style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>
                Validate your Excel files with our automated system
              </p>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── Form Type Dropdown ── */}
              <Field label="Form Type">
                <FocusSelect
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  <option value="">Select form type…</option>

                  {/* Hardcoded forms — always shown */}
                  <optgroup label="Standard Forms">
                    {HARDCODED_FORM_TYPES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </optgroup>

                  {/* Dynamic forms — only shown if any exist */}
                  {dynamicForms.length > 0 && (
                    <optgroup label="Custom Forms">
                      {dynamicForms.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </optgroup>
                  )}
                </FocusSelect>
              </Field>

              {/* Date */}
              <Field label="Select Date">
                <FocusInput
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </Field>

              {/* File drop zone */}
              <Field label="Choose Excel File">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${dragOver ? T.red : file ? T.green : T.grey200}`,
                    borderRadius: 10,
                    padding: "20px 16px",
                    textAlign: "center",
                    background: dragOver ? T.redBg : file ? T.greenBg : T.grey100,
                    transition: "all 0.18s ease",
                    cursor: "pointer",
                  }}
                  onClick={() => document.getElementById("file-upload").click()}
                >
                  <input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => setFile(e.target.files[0])}
                  />

                  {file ? (
                    <>
                      <CheckCircle2 size={36} color={T.green} style={{ margin: "0 auto 10px" }} />
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: T.black, margin: 0 }}>
                        {file.name}
                      </p>
                      <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                        Click to change file
                      </p>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet size={36} color="#A1A1AA" style={{ margin: "0 auto 10px" }} />
                      <p style={{ fontSize: 13.5, color: "#555", margin: 0 }}>
                        Click to upload or drag & drop
                      </p>
                      <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                        XLSX, XLS or CSV
                      </p>
                    </>
                  )}
                </div>
              </Field>
            </div>

            <div style={{ padding: "0 24px 18px" }}>
              <UploadButton loading={loading} onClick={handleUpload} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Upload button ──────────────────────────────────────── */
function UploadButton({ loading, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        padding: "12px 0",
        background: loading ? "#E4E4E7" : hovered ? T.redDark : T.red,
        color: loading ? T.muted : T.white,
        border: "none",
        borderRadius: 10,
        fontSize: 14.5,
        fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all 0.15s ease",
        boxShadow: !loading && hovered ? "0 6px 18px rgba(204,0,0,0.28)" : "none",
        transform: !loading && hovered ? "translateY(-1px)" : "none",
      }}
    >
      {loading ? (
        <>
          <Loader2 size={17} style={{ animation: "spin 0.9s linear infinite" }} />
          Uploading…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <Upload size={17} />
          Upload & Validate
        </>
      )}
    </button>
  );
}

export default UploadPage;