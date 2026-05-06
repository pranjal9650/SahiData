import React, { useState, useEffect, useRef } from "react";
import { BookOpen, ChevronDown, ChevronRight, AlertCircle, Pencil, X, Check, Save } from "lucide-react";

const BASE_URL = "http://127.0.0.1:8000";

const T = {
  red:         "#CC0000",
  redDark:     "#A30000",
  redBg:       "rgba(204,0,0,0.06)",
  redBorder:   "rgba(204,0,0,0.16)",
  black:       "#111111",
  border:      "#EBEBEB",
  bg:          "#F7F7F5",
  white:       "#FFFFFF",
  green:       "#059669",
  greenBg:     "rgba(5,150,105,0.07)",
  greenBorder: "rgba(5,150,105,0.18)",
  blue:        "#2563EB",
  blueBg:      "rgba(37,99,235,0.07)",
  blueBorder:  "rgba(37,99,235,0.16)",
  purple:      "#7C3AED",
  purpleBg:    "rgba(124,58,237,0.07)",
  amber:       "#D97706",
  amberBg:     "rgba(217,119,6,0.07)",
  text:        "#0A0A0A",
  textSub:     "#404040",
  muted:       "#888",
};

/* ─── All editable field types (mirrors CreateForm.js FIELD_TYPES) ── */
const EDITABLE_TYPES = [
  {
    group: "Identity & System Fields",
    types: [
      { value: "uuid",      label: "UUID (Auto ID)",      desc: "System-generated unique ID" },
      { value: "system_id", label: "System ID (Mixed ID)", desc: "IDs like ST-MAH-OD-0023",
        subFields: [{ key: "allowed_prefixes", label: "Allowed Prefixes (comma-separated, optional)", placeholder: "e.g. ST-, OD- — leave blank for any" }] },
      { value: "username",  label: "Username",             desc: "Operator / CreatedUser handle" },
    ],
  },
  {
    group: "Contact Fields",
    types: [
      { value: "email", label: "Email Address", desc: "Standard email format",
        subFields: [{ key: "allowed_domains", label: "Allowed Domains (comma-separated, optional)", placeholder: "e.g. gmail.com, company.in" }] },
      { value: "phone", label: "Phone Number", desc: "Mobile / landline",
        subFields: [{ key: "phone_format", label: "Format", type: "select", options: [
          { value: "india_10",       label: "India — 10-digit mobile" },
          { value: "india_with_code",label: "India with +91" },
          { value: "international",  label: "International" },
          { value: "any",            label: "Any numeric" },
        ]}] },
    ],
  },
  {
    group: "Text Fields",
    types: [
      { value: "text", label: "Text (Name / Remarks)", desc: "Free text — name, remarks, address",
        subFields: [{ key: "textSubtype", label: "Text Sub-type", type: "select", options: [
          { value: "person_name", label: "👤 Person Name — full names like Ramesh Kumar" },
          { value: "site_name",   label: "📍 Site / Place Name — location or infrastructure name" },
          { value: "remarks",     label: "💬 Remarks / Free Text — open-ended notes or comments" },
          { value: "address",     label: "🏠 Address — street address, locality, area" },
          { value: "city",        label: "🏙️ City / District — validated against known Indian cities" },
          { value: "state",       label: "🗺️ State / UT — validated against all Indian states and UTs" },
          { value: "custom",      label: "⚙️ Custom — configure manually" },
        ]}] },
      { value: "pincode", label: "Pincode / ZIP",          desc: "Postal code validation",
        subFields: [{ key: "pincode_format", label: "Format", type: "select", options: [
          { value: "india_6",     label: "India — 6-digit pincode" },
          { value: "us_zip",      label: "US ZIP code" },
          { value: "any_numeric", label: "Any numeric postal code" },
        ]}] },
    ],
  },
  {
    group: "Numeric & Meter Data",
    types: [
      { value: "meter_reading", label: "Meter Reading", desc: "Non-negative integer meter value",
        subFields: [
          { key: "min", label: "Min Reading", placeholder: "e.g. 0" },
          { key: "max", label: "Max Reading", placeholder: "e.g. 999999" },
        ] },
      { value: "consumption", label: "Total Consumption", desc: "Closing minus opening reading" },
      { value: "number", label: "General Number", desc: "Whole or decimal numeric value",
        subFields: [
          { key: "min", label: "Min Value", placeholder: "e.g. 0" },
          { key: "max", label: "Max Value", placeholder: "e.g. 100000" },
        ] },
    ],
  },
  {
    group: "Financial Fields",
    types: [
      { value: "inr_amount", label: "Total Amount (₹)", desc: "Indian Rupee monetary value",
        subFields: [
          { key: "min", label: "Min Amount", placeholder: "e.g. 0" },
          { key: "max", label: "Max Amount", placeholder: "e.g. 100000" },
        ] },
      { value: "inr_rate", label: "Per Unit Cost (₹)", desc: "Cost per unit in INR" },
    ],
  },
  {
    group: "Date & Time Fields",
    types: [
      { value: "datetime", label: "Date & Time", desc: "e.g. 03/04/2026 14:22:57",
        subFields: [{ key: "format", label: "Format", type: "select", options: [
          { value: "dd/mm/yyyy hh:mm:ss", label: "DD/MM/YYYY HH:MM:SS" },
          { value: "mm/dd/yyyy hh:mm:ss", label: "MM/DD/YYYY HH:MM:SS" },
          { value: "yyyy-mm-dd hh:mm:ss", label: "YYYY-MM-DD HH:MM:SS" },
        ]}] },
      { value: "date", label: "Date Only", desc: "Date without time component",
        subFields: [{ key: "format", label: "Format", type: "select", options: [
          { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
          { value: "mm-dd-yyyy", label: "MM-DD-YYYY" },
          { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
        ]}] },
    ],
  },
  {
    group: "Location Fields",
    types: [
      { value: "latlong_text", label: "Lat/Long (Text)", desc: "e.g. 18.516, 73.856" },
      { value: "latlong_json", label: "Lat/Long (JSON)", desc: 'GeoJSON coordinates format' },
      { value: "latitude",     label: "Latitude Only",   desc: "Decimal -90 to 90" },
      { value: "longitude",    label: "Longitude Only",  desc: "Decimal -180 to 180" },
    ],
  },
  {
    group: "Approval & Status",
    types: [
      { value: "approval_flag", label: "Approved / Rejected", desc: "Yes/No, Approved/Rejected values",
        subFields: [
          { key: "true_values",  label: "Approved Values",  placeholder: "e.g. Yes, Approved, 1" },
          { key: "false_values", label: "Rejected Values",  placeholder: "e.g. No, Rejected, 0" },
        ] },
    ],
  },
  {
    group: "Dropdown / Fixed Values",
    types: [
      { value: "dropdown", label: "Fixed Options (Dropdown)", desc: "Must be one of a fixed list",
        subFields: [{ key: "options", label: "Options (comma-separated)", placeholder: "e.g. Circle1, Circle2, Circle3" }] },
    ],
  },
];

/* flat map for quick lookup */
const TYPE_MAP = {};
EDITABLE_TYPES.forEach((g) => g.types.forEach((t) => { TYPE_MAP[t.value] = t; }));

/* ─── Colour meta per rule type ─────────────────────────────────── */
const TYPE_META = {
  uuid:          { color: T.purple, bg: T.purpleBg },
  system_id:     { color: T.blue,   bg: T.blueBg   },
  username:      { color: T.blue,   bg: T.blueBg   },
  email:         { color: T.green,  bg: T.greenBg  },
  phone:         { color: T.green,  bg: T.greenBg  },
  text:          { color: T.amber,  bg: T.amberBg  },
  pincode:       { color: T.amber,  bg: T.amberBg  },
  number:        { color: T.purple, bg: T.purpleBg },
  meter_reading: { color: T.purple, bg: T.purpleBg },
  consumption:   { color: T.purple, bg: T.purpleBg },
  inr_amount:    { color: T.green,  bg: T.greenBg  },
  inr_rate:      { color: T.green,  bg: T.greenBg  },
  date:          { color: T.blue,   bg: T.blueBg   },
  datetime:      { color: T.blue,   bg: T.blueBg   },
  latlong_text:  { color: T.red,    bg: T.redBg    },
  latlong_json:  { color: T.red,    bg: T.redBg    },
  latitude:      { color: T.red,    bg: T.redBg    },
  longitude:     { color: T.red,    bg: T.redBg    },
  approval_flag: { color: T.amber,  bg: T.amberBg  },
  dropdown:      { color: T.blue,   bg: T.blueBg   },
};

function typeMeta(type) {
  return TYPE_META[type] || { color: T.muted, bg: "#F4F4F5" };
}

const SUBFIELD_LABELS = {
  allowed_prefixes: "Allowed Prefixes",
  allowed_domains:  "Allowed Domains",
  phone_format:     "Phone Format",
  pincode_format:   "Pincode Format",
  format:           "Format",
  min:              "Min",
  max:              "Max",
  unit:             "Unit",
  true_values:      "Approved Values",
  false_values:     "Rejected Values",
  options:          "Options",
  textSubtype:      "Sub-type",
};

/* Friendly display label for textSubtype values */
const TEXT_SUBTYPE_LABELS = {
  person_name: "Person Name",
  site_name:   "Site / Place Name",
  remarks:     "Remarks / Free Text",
  address:     "Address",
  city:        "City / District",
  state:       "State / UT",
  custom:      "Custom",
};

/* ─── Config chips (read-only row display) ───────────────────────── */
function ConfigChip({ label, fieldKey, value }) {
  if (!value && value !== 0) return null;
  const display = fieldKey === "textSubtype"
    ? (TEXT_SUBTYPE_LABELS[value] || value)
    : String(value);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 9px", borderRadius: 5,
      background: T.bg, border: `1px solid ${T.border}`,
      fontSize: 11.5, color: T.textSub, fontWeight: 500, whiteSpace: "nowrap",
    }}>
      <span style={{ color: T.muted, fontWeight: 400 }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{display}</span>
    </span>
  );
}

/* ─── Edit Rule Modal ────────────────────────────────────────────── */
function EditModal({ formName, colName, currentRule, allData, onClose, onSaved }) {
  const [selectedType, setSelectedType] = useState(currentRule?.type || "");
  const [config, setConfig]             = useState({ ...currentRule });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [showConfirm, setShowConfirm]   = useState(false);
  const configRef    = useRef(null);
  const modalBodyRef = useRef(null);

  const typeDef   = TYPE_MAP[selectedType];
  const subFields = typeDef?.subFields || [];

  /* when type changes, keep only config keys valid for new type */
  const handleTypeChange = (newType) => {
    setSelectedType(newType);
    const newDef = TYPE_MAP[newType];
    const keepKeys = new Set((newDef?.subFields || []).map((sf) => sf.key));
    const cleaned = { type: newType };
    keepKeys.forEach((k) => { if (config[k] !== undefined) cleaned[k] = config[k]; });
    setConfig(cleaned);
    setError("");
    /* scroll to Configuration section if the new type has sub-fields */
    if ((newDef?.subFields || []).length > 0) {
      setTimeout(() => {
        configRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  };

  const setField = (key, val) => setConfig((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!selectedType) { setError("Please select a rule type."); return; }
    setSaving(true); setError("");
    try {
      const updatedRules = {
        ...allData.rules,
        [colName]: { type: selectedType, ...Object.fromEntries(
          subFields.map((sf) => [sf.key, config[sf.key] ?? ""]).filter(([, v]) => v !== "")
        )},
      };
      const res = await fetch(`${BASE_URL}/SAVE-FORM-RULES`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_name: formName,
          columns:   allData.columns,
          rules:     updatedRules,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Save failed"); }
      onSaved(updatedRules);
    } catch (e) {
      setError(e.message || "Unable to reach the server.");
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: T.white, borderRadius: 16,
        width: "100%", maxWidth: 620,
        maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.3px" }}>
              Edit Validation Rule
            </h3>
            <p style={{ fontSize: 12.5, color: T.muted, margin: "4px 0 0" }}>
              <span style={{ fontFamily: "monospace", background: T.bg, padding: "1px 6px", borderRadius: 4, color: T.text, fontWeight: 600 }}>{colName}</span>
              &nbsp;· {formName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.border)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.bg)}
          >
            <X size={15} color={T.muted} />
          </button>
        </div>

        {/* Body */}
        <div ref={modalBodyRef} style={{ overflowY: "auto", flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Type selector */}
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.7px", margin: "0 0 10px" }}>
              Rule Type
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {EDITABLE_TYPES.map((group) => (
                <div key={group.group}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.6px", margin: "8px 0 5px" }}>
                    {group.group}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {group.types.map((t) => {
                      const on = selectedType === t.value;
                      const m  = typeMeta(t.value);
                      return (
                        <button
                          key={t.value}
                          onClick={() => handleTypeChange(t.value)}
                          title={t.desc}
                          style={{
                            padding: "5px 13px", borderRadius: 7,
                            border: `1px solid ${on ? m.color + "44" : T.border}`,
                            background: on ? m.bg : T.bg,
                            color: on ? m.color : T.textSub,
                            fontSize: 12.5, fontWeight: on ? 700 : 500,
                            fontFamily: "'DM Sans', sans-serif",
                            cursor: "pointer", transition: "all 0.12s ease",
                            display: "inline-flex", alignItems: "center", gap: 5,
                          }}
                          onMouseEnter={(e) => { if (!on) { e.currentTarget.style.borderColor = m.color + "44"; e.currentTarget.style.color = m.color; } }}
                          onMouseLeave={(e) => { if (!on) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSub; } }}
                        >
                          {on && <Check size={10} />}
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sub-fields for selected type */}
          {selectedType && subFields.length > 0 && (
            <div ref={configRef} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.7px", margin: "0 0 12px" }}>
                Configuration
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {subFields.map((sf) => (
                  <div key={sf.key}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: T.textSub, display: "block", marginBottom: 6 }}>
                      {sf.label}
                    </label>
                    {sf.type === "select" ? (
                      <select
                        value={config[sf.key] || ""}
                        onChange={(e) => setField(sf.key, e.target.value)}
                        style={{
                          width: "100%", padding: "9px 12px", borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.bg,
                          fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text,
                          outline: "none", cursor: "pointer",
                        }}
                      >
                        <option value="">— Select —</option>
                        {sf.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={config[sf.key] || ""}
                        onChange={(e) => setField(sf.key, e.target.value)}
                        placeholder={sf.placeholder || ""}
                        style={{
                          width: "100%", padding: "9px 12px", borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.bg,
                          fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: T.text,
                          outline: "none", boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.08)"; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected type preview */}
          {selectedType && typeDef && (
            <div style={{
              padding: "10px 14px", borderRadius: 9,
              background: typeMeta(selectedType).bg,
              border: `1px solid ${typeMeta(selectedType).color}22`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: typeMeta(selectedType).color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: typeMeta(selectedType).color, fontWeight: 600 }}>
                {typeDef.label}
              </span>
              <span style={{ fontSize: 12, color: T.muted }}>— {typeDef.desc}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              borderLeft: `3px solid ${T.red}`,
              color: T.red, fontSize: 13, fontWeight: 500,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${T.border}`,
          background: T.bg,
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "0 18px", height: 36, borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.white,
              color: T.textSub, fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (!selectedType) { setError("Please select a rule type."); return; } setError(""); setShowConfirm(true); }}
            disabled={saving || !selectedType}
            style={{
              padding: "0 20px", height: 36, borderRadius: 8,
              border: "none",
              background: saving || !selectedType
                ? "#E5E5E5"
                : `linear-gradient(135deg, ${T.red} 0%, ${T.redDark} 100%)`,
              color: saving || !selectedType ? T.muted : T.white,
              fontSize: 13, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: saving || !selectedType ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 7,
              boxShadow: saving || !selectedType ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { if (!saving && selectedType) e.currentTarget.style.boxShadow = "0 4px 12px rgba(204,0,0,0.28)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.15)"; }}
          >
            <><Save size={13} /> Save Rule</>
          </button>
        </div>

        {/* ── Confirmation overlay ── */}
        {showConfirm && (() => {
          const prevLabel = currentRule?.type ? (TYPE_MAP[currentRule.type]?.label || currentRule.type) : null;
          const nextLabel = TYPE_MAP[selectedType]?.label || selectedType;
          const isChange  = currentRule?.type && currentRule.type !== selectedType;

          return (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: "rgba(10,10,10,0.55)",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 28,
              backdropFilter: "blur(2px)",
              animation: "fadeIn 0.15s ease",
            }}>
              <div style={{
                background: T.white, borderRadius: 14,
                width: "100%", maxWidth: 440,
                boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
                overflow: "hidden",
              }}>
                {/* Confirm header */}
                <div style={{
                  padding: "20px 22px 16px",
                  borderBottom: `1px solid ${T.border}`,
                  display: "flex", alignItems: "flex-start", gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: "rgba(217,119,6,0.10)",
                    border: "1px solid rgba(217,119,6,0.22)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.2px" }}>
                      Confirm Rule Change
                    </p>
                    <p style={{ fontSize: 12.5, color: T.muted, margin: "3px 0 0", lineHeight: 1.5 }}>
                      Review the change below before applying it.
                    </p>
                  </div>
                </div>

                {/* Change summary */}
                <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Column + form pill */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                    padding: "9px 12px", borderRadius: 8,
                    background: T.bg, border: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px" }}>Column</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.text,
                      background: T.white, border: `1px solid ${T.border}`, padding: "1px 8px", borderRadius: 5 }}>
                      {colName}
                    </span>
                    <span style={{ fontSize: 11, color: T.muted }}>in</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{formName}</span>
                  </div>

                  {/* Before → After */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", borderRadius: 9,
                    background: isChange ? "rgba(217,119,6,0.05)" : T.greenBg,
                    border: `1px solid ${isChange ? "rgba(217,119,6,0.18)" : T.greenBorder}`,
                  }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 5px" }}>Current</p>
                      {prevLabel ? (
                        <span style={{
                          display: "inline-block", fontSize: 12.5, fontWeight: 700,
                          color: typeMeta(currentRule.type).color,
                          background: typeMeta(currentRule.type).bg,
                          padding: "3px 10px", borderRadius: 6,
                          border: `1px solid ${typeMeta(currentRule.type).color}33`,
                        }}>{prevLabel}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>Not set</span>
                      )}
                    </div>

                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>

                    <div style={{ flex: 1, textAlign: "center" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 5px" }}>New</p>
                      <span style={{
                        display: "inline-block", fontSize: 12.5, fontWeight: 700,
                        color: typeMeta(selectedType).color,
                        background: typeMeta(selectedType).bg,
                        padding: "3px 10px", borderRadius: 6,
                        border: `1px solid ${typeMeta(selectedType).color}33`,
                      }}>{nextLabel}</span>
                    </div>
                  </div>

                  {/* Re-validation notice */}
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 9,
                    padding: "10px 12px", borderRadius: 8,
                    background: T.redBg, border: `1px solid ${T.redBorder}`,
                    borderLeft: `3px solid ${T.red}`,
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.86"/>
                    </svg>
                    <p style={{ fontSize: 12, color: T.red, margin: 0, lineHeight: 1.55, fontWeight: 500 }}>
                      All existing records for <strong>{formName}</strong> will be <strong>immediately re-validated</strong> against this updated rule. This action cannot be undone.
                    </p>
                  </div>
                </div>

                {/* Confirm footer */}
                <div style={{
                  padding: "14px 22px",
                  borderTop: `1px solid ${T.border}`,
                  background: T.bg,
                  display: "flex", gap: 10, justifyContent: "flex-end",
                }}>
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={saving}
                    style={{
                      padding: "0 18px", height: 36, borderRadius: 8,
                      border: `1px solid ${T.border}`, background: T.white,
                      color: T.textSub, fontSize: 13, fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.border)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => { setShowConfirm(false); handleSave(); }}
                    disabled={saving}
                    style={{
                      padding: "0 20px", height: 36, borderRadius: 8,
                      border: "none",
                      background: saving ? "#E5E5E5" : `linear-gradient(135deg, ${T.red} 0%, ${T.redDark} 100%)`,
                      color: saving ? T.muted : T.white,
                      fontSize: 13, fontWeight: 700,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: saving ? "not-allowed" : "pointer",
                      display: "inline-flex", alignItems: "center", gap: 7,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => { if (!saving) e.currentTarget.style.boxShadow = "0 4px 12px rgba(204,0,0,0.28)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.15)"; }}
                  >
                    {saving
                      ? <><div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", animation: "spin 0.75s linear infinite" }} /> Applying…</>
                      : <><Save size={13} /> Confirm &amp; Apply</>
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ─── Single rule row ────────────────────────────────────────────── */
function RuleRow({ col, rule, index, isLast, onEdit }) {
  const meta = typeMeta(rule?.type);
  const typeLabel = TYPE_MAP[rule?.type]?.label || rule?.type || "—";
  const subEntries = Object.entries(rule || {}).filter(([k, v]) => k !== "type" && v !== "" && v != null);
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      style={{ background: hovered ? T.bg : T.white, transition: "background 0.1s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* # */}
      <td style={{ padding: "13px 16px", borderBottom: isLast ? "none" : `1px solid ${T.border}`, color: T.muted, fontSize: 12, width: 42 }}>
        {index + 1}
      </td>

      {/* Column name */}
      <td style={{ padding: "13px 20px", borderBottom: isLast ? "none" : `1px solid ${T.border}`, maxWidth: 220 }}>
        <span style={{ fontWeight: 700, color: T.text, fontSize: 13, fontFamily: "monospace" }}>
          {col}
        </span>
      </td>

      {/* Rule type badge */}
      <td style={{ padding: "13px 20px", borderBottom: isLast ? "none" : `1px solid ${T.border}` }}>
        {rule?.type ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 11px", borderRadius: 6,
            background: meta.bg, border: `1px solid ${meta.color}22`,
            fontSize: 12, fontWeight: 700, color: meta.color, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
            {typeLabel}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#C4C4C4", fontStyle: "italic" }}>Not set</span>
        )}
      </td>

      {/* Description */}
      <td style={{ padding: "13px 20px", borderBottom: isLast ? "none" : `1px solid ${T.border}`, color: T.textSub, fontSize: 12.5 }}>
        {TYPE_MAP[rule?.type]?.desc || "—"}
      </td>

      {/* Config chips */}
      <td style={{ padding: "13px 20px", borderBottom: isLast ? "none" : `1px solid ${T.border}` }}>
        {subEntries.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {subEntries.map(([k, v]) => (
              <ConfigChip key={k} fieldKey={k} label={SUBFIELD_LABELS[k] || k} value={v} />
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#D0D0D0" }}>—</span>
        )}
      </td>

      {/* Edit button — sticky so it's always visible on horizontal scroll */}
      <td style={{
        padding: "13px 16px",
        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
        width: 64, textAlign: "center",
        position: "sticky", right: 0,
        background: hovered ? T.bg : T.white,
        boxShadow: "-3px 0 6px rgba(0,0,0,0.06)",
        transition: "background 0.1s",
      }}>
        <button
          onClick={() => onEdit(col, rule)}
          title="Edit rule"
          style={{
            width: 30, height: 30, borderRadius: 7,
            border: `1px solid ${T.redBorder}`,
            background: T.redBg,
            color: T.red,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.12s ease", flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204,0,0,0.14)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(204,0,0,0.18)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.boxShadow = "none"; }}
        >
          <Pencil size={12} />
        </button>
      </td>
    </tr>
  );
}

/* ─── Form Rules Card ────────────────────────────────────────────── */
function FormRulesCard({ formName }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [editTarget, setEditTarget]   = useState(null); // { col, rule }
  const [savedMsg, setSavedMsg]       = useState("");
  const [revalidating, setRevalidating] = useState(false);

  const fetchRules = () => {
    setLoading(true); setError(false);
    fetch(`${BASE_URL}/GET-FORM-RULES?form_name=${encodeURIComponent(formName)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRules(); }, [formName]); // eslint-disable-line

  const handleEdit = (col, rule) => setEditTarget({ col, rule });

  const handleSaved = async (updatedRules) => {
    setData((prev) => ({ ...prev, rules: updatedRules }));
    setEditTarget(null);
    setSavedMsg("Re-validating records…");
    setRevalidating(true);
    try {
      const res = await fetch(`${BASE_URL}/REVALIDATE-FORM`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_name: formName }),
      });
      if (res.ok) {
        const result = await res.json().catch(() => ({}));
        const count = result.revalidated ?? result.uploads ?? "";
        setSavedMsg(count ? `Rules updated — ${count} upload${count !== 1 ? "s" : ""} re-validated` : "Rules updated — records re-validated");
      } else {
        setSavedMsg("Rule saved (re-validation failed)");
      }
    } catch {
      setSavedMsg("Rule saved (server unreachable for re-validation)");
    }
    setRevalidating(false);
    setTimeout(() => setSavedMsg(""), 4000);
    /* persist signal so components pick it up even after navigating away and back */
    localStorage.setItem("rulesUpdatedAt", Date.now());
    /* notify any currently-mounted sections to re-fetch immediately */
    window.dispatchEvent(new CustomEvent("rulesUpdated", { detail: { formName } }));
  };

  const columns = data?.columns || [];
  const rules   = data?.rules   || {};

  return (
    <>
      {editTarget && (
        <EditModal
          formName={formName}
          colName={editTarget.col}
          currentRule={editTarget.rule}
          allData={data}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div style={{
        background: T.white, border: `1px solid ${T.border}`,
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* Card header */}
        <div
          onClick={() => setCollapsed((c) => !c)}
          style={{
            padding: "16px 22px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer",
            borderBottom: collapsed ? "none" : `1px solid ${T.border}`,
            userSelect: "none", transition: "background 0.12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.bg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <BookOpen size={15} color={T.red} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "-0.2px" }}>
                {formName}
              </span>
              {!loading && !error && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: T.muted,
                  background: T.bg, border: `1px solid ${T.border}`,
                  padding: "1px 8px", borderRadius: 99,
                }}>
                  {columns.length} column{columns.length !== 1 ? "s" : ""}
                </span>
              )}
              {savedMsg && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: revalidating ? T.amber : T.green,
                  background: revalidating ? T.amberBg : T.greenBg,
                  border: `1px solid ${revalidating ? "rgba(217,119,6,0.25)" : T.greenBorder}`,
                  padding: "2px 9px", borderRadius: 99,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  animation: "fadeIn 0.2s ease",
                }}>
                  {revalidating
                    ? <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${T.amber}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                    : <Check size={9} />
                  }
                  {savedMsg}
                </span>
              )}
            </div>
          </div>
          {collapsed
            ? <ChevronRight size={16} color={T.muted} />
            : <ChevronDown size={16} color={T.muted} />}
        </div>

        {!collapsed && (
          loading ? (
            <div style={{ padding: "32px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${T.border}`, borderTop: `2px solid ${T.red}`, animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, color: T.muted }}>Loading rules…</span>
            </div>
          ) : error ? (
            <div style={{ padding: "24px 22px", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={16} color={T.red} />
              <span style={{ fontSize: 13, color: T.muted }}>
                Could not load rules. Make sure <code style={{ fontSize: 11.5, background: T.bg, padding: "1px 5px", borderRadius: 4 }}>/GET-FORM-RULES</code> is available.
              </span>
            </div>
          ) : columns.length === 0 ? (
            <div style={{ padding: "24px 22px", fontSize: 13, color: T.muted }}>No columns found for this form.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: "#FAFAF9" }}>
                    {["#", "Column Name", "Rule Type", "Description", "Configuration"].map((h, i) => (
                      <th key={i} style={{
                        padding: "10px 20px", textAlign: "left",
                        fontSize: 10.5, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.8px",
                        color: "#A0A0A0", borderBottom: `1px solid ${T.border}`,
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                    <th style={{
                      padding: "10px 16px", textAlign: "center",
                      fontSize: 10.5, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.8px",
                      color: "#A0A0A0", borderBottom: `1px solid ${T.border}`,
                      whiteSpace: "nowrap",
                      position: "sticky", right: 0,
                      background: "#FAFAF9",
                      boxShadow: "-3px 0 6px rgba(0,0,0,0.06)",
                    }}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <RuleRow
                      key={col}
                      col={col}
                      rule={rules[col]}
                      index={i}
                      isLast={i === columns.length - 1}
                      onEdit={handleEdit}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function Rules() {
  const [formNames, setFormNames]     = useState([]);
  const [selected, setSelected]       = useState([]);
  const [formsLoading, setFormsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/GET-FORM-NAMES`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          const names = d.filter((f) => f !== "Others");
          setFormNames(names);
          setSelected(names);
        }
      })
      .catch(() => {})
      .finally(() => setFormsLoading(false));
  }, []);

  const allSelected = selected.length === formNames.length && formNames.length > 0;

  const toggle = (name) =>
    setSelected((prev) => prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* ── Filter bar ── */}
      <div style={{
        background: T.white, border: `1px solid ${T.border}`,
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={15} color={T.red} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Validation Rule Book</span>
            <span style={{ fontSize: 12, color: T.muted }}>— click the pencil icon on any row to edit a rule</span>
            {selected.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: T.red,
                background: T.redBg, border: `1px solid ${T.redBorder}`,
                padding: "1px 7px", borderRadius: 99,
              }}>
                {selected.length} form{selected.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {!formsLoading && formNames.length > 0 && (
            <button
              onClick={() => setSelected(allSelected ? [] : [...formNames])}
              style={{
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                padding: "5px 12px", borderRadius: 7,
                border: `1px solid ${allSelected ? T.redBorder : T.border}`,
                background: allSelected ? T.redBg : T.bg,
                color: allSelected ? T.red : T.textSub,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.14s ease",
              }}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>

        <div style={{ padding: "14px 20px" }}>
          {formsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 13 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${T.border}`, borderTop: `2px solid ${T.red}`, animation: "spin 0.8s linear infinite" }} />
              Loading forms…
            </div>
          ) : formNames.length === 0 ? (
            <span style={{ fontSize: 13, color: T.muted }}>No forms found. Create a form first via the Create Form page.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {formNames.map((name) => {
                const on = selected.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => toggle(name)}
                    style={{
                      padding: "7px 15px", borderRadius: 8,
                      border: `1px solid ${on ? T.redBorder : T.border}`,
                      background: on ? T.redBg : T.bg,
                      color: on ? T.red : T.textSub,
                      fontSize: 13, fontWeight: on ? 700 : 500,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer", transition: "all 0.14s ease",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                    onMouseEnter={(e) => { if (!on) { e.currentTarget.style.borderColor = T.redBorder; e.currentTarget.style.color = T.red; } }}
                    onMouseLeave={(e) => { if (!on) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSub; } }}
                  >
                    {on && <span style={{ fontSize: 9 }}>✓</span>}
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected.length === 0 && !formsLoading && formNames.length > 0 && (
        <div style={{
          padding: "28px 20px", borderRadius: 14,
          border: `1px solid ${T.border}`, background: T.white,
          textAlign: "center", color: T.muted, fontSize: 13,
        }}>
          Select at least one form above to view its validation rules.
        </div>
      )}

      {selected.map((name) => <FormRulesCard key={name} formName={name} />)}
    </div>
  );
}
