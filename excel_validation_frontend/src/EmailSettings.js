import React, { useState, useEffect } from "react";
import axios from "axios";
import { Mail, Key, CheckCircle, AlertCircle, Eye, EyeOff, Save, Server } from "lucide-react";

const API = "http://127.0.0.1:8001";

const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  redLight: "rgba(204,0,0,0.07)",
  white:    "#FFFFFF",
  grey50:   "#F9FAFB",
  grey100:  "#F3F4F6",
  grey200:  "#E5E7EB",
  text:     "#111111",
  muted:    "#6B7280",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.08)",
  amber:    "#D97706",
  amberBg:  "rgba(217,119,6,0.07)",
};

// Personal @outlook.com/@hotmail.com use a different SMTP than Microsoft 365 work accounts
function smtpFromEmail(email) {
  const domain = (email || "").split("@")[1]?.toLowerCase() || "";
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain))
    return { host: "smtp-mail.outlook.com", port: 587 };
  return { host: "smtp.office365.com", port: 587 };
}

function Toast({ toast }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 8,
      padding: "11px 16px", borderRadius: 10, background: T.white,
      border: `1px solid ${ok ? "rgba(5,150,105,0.25)" : "rgba(204,0,0,0.25)"}`,
      boxShadow: "0 6px 24px rgba(0,0,0,0.11)",
      fontSize: 13, fontWeight: 600, color: ok ? T.green : T.red,
      fontFamily: "'DM Sans', sans-serif", animation: "slideIn 0.2s ease",
    }}>
      {ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
      {toast.msg}
    </div>
  );
}

export default function EmailSettings() {
  const [senderEmail,  setSenderEmail]  = useState("");
  const [appPassword,  setAppPassword]  = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasPassword,  setHasPassword]  = useState(false);
  const [smtpInfo,     setSmtpInfo]     = useState({ host: "smtp.office365.com", port: 587 });
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState(null);
  const [focused,      setFocused]      = useState(null);
  const [emailError,   setEmailError]   = useState("");

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); };

  useEffect(() => {
    axios.get(`${API}/EMAIL-CONFIG`)
      .then(r => {
        const email = r.data.sender_email || "";
        setSenderEmail(email);
        setHasPassword(r.data.has_password || false);
        setSmtpInfo(smtpFromEmail(email));
      })
      .catch(() => showToast("error", "Could not load email config."))
      .finally(() => setLoading(false));
  }, []);

  const handleEmailChange = (val) => {
    setSenderEmail(val);
    setEmailError("");
    setSmtpInfo(smtpFromEmail(val));
  };

  const validate = () => {
    if (!senderEmail.trim()) { setEmailError("Email is required."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail.trim())) { setEmailError("Enter a valid email address."); return false; }
    setEmailError(""); return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const smtp = smtpFromEmail(senderEmail.trim());

      // If a new password is provided, verify it works before saving
      if (appPassword.trim()) {
        try {
          await axios.post(`${API}/EMAIL-CONFIG/TEST`, {
            sender_email: senderEmail.trim(),
            app_password: appPassword.trim(),
            smtp_host:    smtp.host,
            smtp_port:    smtp.port,
          });
        } catch (e) {
          showToast("error", e.response?.data?.detail || "Password verification failed.");
          setSaving(false);
          return;
        }
      }

      await axios.put(`${API}/EMAIL-CONFIG`, {
        sender_email: senderEmail.trim(),
        app_password: appPassword.trim(),
        smtp_host:    smtp.host,
        smtp_port:    smtp.port,
      });
      setAppPassword(""); setHasPassword(true);
      showToast("success", appPassword.trim() ? "Email settings saved & verified." : "Email address updated.");
    } catch (e) {
      showToast("error", e.response?.data?.detail || "Failed to save settings.");
    } finally { setSaving(false); }
  };

  const inputStyle = (field) => ({
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1.5px solid ${focused === field ? T.red : (emailError && field === "email") ? T.red : T.grey200}`,
    fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
    color: T.text, background: T.white, outline: "none",
    transition: "all 0.15s", boxSizing: "border-box",
    boxShadow: focused === field ? "0 0 0 3px rgba(204,0,0,0.08)" : "none",
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${T.grey200}`, borderTop: `3px solid ${T.red}`, animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:none; } }
      `}</style>
      <Toast toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: "0 0 3px", letterSpacing: "-0.4px" }}>Email Settings</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>Configure the Outlook account used to send all reports.</p>
        </div>
        {hasPassword && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: T.greenBg, color: T.green, border: "1px solid rgba(5,150,105,0.2)" }}>✓ Configured</span>
        )}
      </div>

      {/* Info banner */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 9, marginBottom: 12, background: T.amberBg, border: "1px solid rgba(217,119,6,0.2)" }}>
        <AlertCircle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12.5, color: T.amber, lineHeight: 1.5 }}>
          Use your regular Outlook password. If MFA is enabled on your account, generate an <strong>App Password</strong> from{" "}
          <strong>account.microsoft.com → Security → Advanced security → App passwords</strong>.
        </p>
      </div>

      {/* Main card */}
      <div style={{ background: T.white, borderRadius: 12, border: `1px solid ${T.grey200}`, boxShadow: "0 1px 5px rgba(0,0,0,0.06)", overflow: "hidden" }}>

        {/* Card header */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.grey200}`, display: "flex", alignItems: "center", gap: 10, background: T.grey50 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: T.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Mail size={14} color={T.red} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Sender Account</p>
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Emails are sent from this Outlook address</p>
          </div>
          {/* SMTP chip */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, background: T.grey100, border: `1px solid ${T.grey200}` }}>
            <Server size={10} color={T.muted} />
            <span style={{ fontSize: 10.5, fontFamily: "monospace", color: T.muted }}>{smtpInfo.host}</span>
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 5 }}>
              <Mail size={11} color={T.muted} /> Sender Email Address
            </label>
            <input
              type="email" value={senderEmail}
              onChange={e => handleEmailChange(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => { setFocused(null); validate(); }}
              placeholder="yourname@shaurryatele.com"
              style={inputStyle("email")}
            />
            {emailError
              ? <p style={{ margin: 0, fontSize: 11, color: T.red, display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={11} />{emailError}</p>
              : <p style={{ margin: 0, fontSize: 11, color: T.muted }}>This address appears as the sender on all report emails.</p>
            }
          </div>

          <div style={{ height: 1, background: T.grey100 }} />

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 5 }}>
              <Key size={11} color={T.muted} /> Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"} value={appPassword}
                onChange={e => setAppPassword(e.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                placeholder={hasPassword ? "Enter new password to replace existing" : "Enter your Outlook password"}
                style={{ ...inputStyle("password"), paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 0,
                display: "flex", alignItems: "center",
              }}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>
              {hasPassword ? "Password saved. Leave blank to keep existing." : "Enter your Outlook password or App Password."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "11px 20px", borderTop: `1px solid ${T.grey200}`,
          background: T.grey50, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {senderEmail ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Mail size={12} color={T.muted} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap" }}>Sending from</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{senderEmail}</span>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>
              {appPassword.trim() ? "Password will be verified before saving." : ""}
            </p>
          )}
          <button
            onClick={handleSave} disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: saving ? T.grey200 : T.red,
              color: saving ? T.muted : T.white,
              fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              cursor: saving ? "not-allowed" : "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = T.redDark; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 5px 16px rgba(204,0,0,0.28)"; } }}
            onMouseLeave={e => { if (!saving) { e.currentTarget.style.background = T.red; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
          >
            {saving
              ? <><div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.15)", borderTop: `2px solid ${T.muted}`, animation: "spin 0.8s linear infinite" }} />Verifying…</>
              : <><Save size={13} />Save Changes</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
