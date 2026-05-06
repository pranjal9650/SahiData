import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import logoDark from "./assets/logo-dark.png";

const T = {
  red:     "#CC0000",
  redDark: "#A30000",
  black:   "#111111",
  grey50:  "#F9F9F9",
  grey100: "#F2F0EB",
  grey200: "#E5E2DC",
  white:   "#FFFFFF",
  text:    "#111111",
  muted:   "#6B7280",
};

function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState(null);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter both email and password."); return; }
    setLoading(true); setError("");
    setTimeout(() => {
      if (email === "admin@gmail.com" && password === "1234") {
        localStorage.setItem("isLoggedIn", "true");
        navigate("/dashboard");
      } else {
        setError("Invalid email or password.");
      }
      setLoading(false);
    }, 800);
  };

  const inputStyle = (field) => ({
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1.5px solid ${focused === field ? T.red : T.grey200}`,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    color: T.text,
    background: focused === field ? T.white : T.grey50,
    outline: "none",
    transition: "all 0.15s ease",
    boxShadow: focused === field ? "0 0 0 3px rgba(204,0,0,0.09)" : "none",
    boxSizing: "border-box",
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Left: Brand Panel ───────────────────────────── */}
      <div style={{
        width: "44%",
        minHeight: "100vh",
        background: T.black,
        display: "flex",
        flexDirection: "column",
        padding: "48px 52px",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {/* Red glow accents */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            radial-gradient(circle at 10% 90%, rgba(204,0,0,0.28) 0%, transparent 55%),
            radial-gradient(circle at 90% 10%, rgba(204,0,0,0.12) 0%, transparent 50%)
          `,
        }} />
        {/* Subtle dot grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        {/* Logo — top */}
        <div style={{ position: "relative", zIndex: 1, marginBottom: 0 }}>
          <img
            src={logoDark}
            alt="Shaurrya Teleservices"
            style={{
              height: 64,
              width: "auto",
              objectFit: "contain",
              mixBlendMode: "screen",
            }}
          />
        </div>

        {/* Content — vertically centred */}
        <div style={{
          position: "relative", zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>
          {/* Portal name */}
          <div style={{ marginBottom: 20 }}>
            <span style={{
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: "-1.5px",
              display: "inline-block",
              filter: "drop-shadow(0 0 18px rgba(204,0,0,0.55))",
            }}>
              <span style={{
                color: T.white,
                textShadow: "0 2px 16px rgba(255,255,255,0.15)",
              }}>Sahi</span>
              <span style={{
                color: T.red,
                textShadow: "0 0 24px rgba(204,0,0,0.8)",
              }}>Data</span>
            </span>
            <div style={{
              height: 3,
              width: 56,
              background: `linear-gradient(90deg, ${T.red}, transparent)`,
              borderRadius: 99,
              marginTop: 6,
            }} />
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 38,
            fontWeight: 800,
            color: T.white,
            letterSpacing: "-1.2px",
            lineHeight: 1.15,
            margin: "0 0 18px",
          }}>
            Validate data.<br />
            <span style={{ color: T.red }}>Ensure accuracy.</span>
          </h1>

          {/* Tagline */}
          <p style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.7,
            margin: 0,
            maxWidth: 340,
          }}>
            Upload Excel files, define validation rules, and get instant quality reports across all form types.
          </p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 32, marginTop: 40 }}>
            {[
              { label: "Forms Supported",   value: "7+"   },
              { label: "Validation Rules",  value: "20+"  },
              { label: "Accuracy Tracking", value: "Live" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: 25, fontWeight: 800, color: T.white, letterSpacing: "-0.5px" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 3, fontWeight: 500 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer — bottom */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", margin: 0 }}>
            © 2025 SahiData. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right: Login Form ────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.white,
        padding: "48px 32px",
      }}>
        <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp 0.4s ease" }}>

          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, margin: "0 0 8px", letterSpacing: "-0.6px" }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>
              Sign in to your account to continue
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "11px 14px", borderRadius: 10,
              background: "rgba(204,0,0,0.06)",
              border: "1px solid rgba(204,0,0,0.18)",
              borderLeft: `3px solid ${T.red}`,
              color: T.red, fontSize: 13.5, fontWeight: 500, marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Email address</label>
              <input
                type="email" placeholder="admin@gmail.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                style={inputStyle("email")}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Password</label>
              <input
                type="password" placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                style={inputStyle("password")}
              />
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                marginTop: 6, width: "100%", padding: "13px",
                background: loading ? T.grey200 : T.red,
                border: "none", borderRadius: 10,
                color: loading ? T.muted : T.white,
                fontSize: 14.5, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.15s ease", letterSpacing: "-0.1px",
              }}
              onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = T.redDark; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(204,0,0,0.30)"; } }}
              onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.background = T.red; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
            >
              {loading ? (
                <>
                  <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.12)", borderTop: `2px solid ${T.muted}`, animation: "spin 0.8s linear infinite" }} />
                  Signing in…
                </>
              ) : "Sign In →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: T.grey200 }} />
            <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>default credentials</span>
            <div style={{ flex: 1, height: 1, background: T.grey200 }} />
          </div>

          {/* Credentials */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: T.grey100, border: `1px solid ${T.grey200}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Email</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: "monospace" }}>admin@gmail.com</div>
            </div>
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: T.grey100, border: `1px solid ${T.grey200}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Password</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: "monospace" }}>1234</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
