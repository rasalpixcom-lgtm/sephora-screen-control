"use client";
import { clientFetch } from "@/lib/client-fetch";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Monitor } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { safeReturnTo, type AuthUser } from "@/lib/auth-policy";
import "./auth.css";
export default function AuthForm({ mode, setupLoginId }: { mode: "login" | "activate"; setupLoginId?: string }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false); const [token, setToken] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  useEffect(() => { if (mode === "activate") { if (window.location.hash) { const value = window.location.hash.slice(1); queueMicrotask(() => setToken(value)); } window.history.replaceState(null, "", "/activate"); } }, [mode]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError("");
    if (mode === "activate" && password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await clientFetch(mode === "login" ? "/api/auth/sign-in/email" : "/api/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "login" ? { email: email.trim().toLowerCase(), password } : { token, password }) });
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(response.status === 429 ? "Too many attempts. Please try again in a minute." : mode === "login" ? "Unable to sign in. Check your login ID and password, or contact your Admin." : result.error || "Could not create the Admin."); }
      setPassword(""); setConfirm("");
      if (mode === "activate") { setToken(""); setDone(true); return; }
      const session = await clientFetch("/api/session", { cache: "no-store" }); if (!session.ok) throw new Error("Your account is unavailable. Contact your Admin.");
      const { user } = await session.json() as { user: AuthUser }; window.location.replace(safeReturnTo(new URLSearchParams(window.location.search).get("next"), user.role));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect. Try again."); } finally { setBusy(false); }
  }
  return <main className="auth-screen"><div className="auth-appearance"><ThemeToggle/></div><section className="auth-card"><div className="auth-brand"><Monitor size={24}/><span>SEPHORA<small>SCREEN CONTROL</small></span></div><h1>{done ? "Password saved" : mode === "login" ? "Welcome back" : "Create the first Admin"}</h1><p>{done ? "Your account is ready. Sign in to continue." : mode === "login" ? "Sign in to your workspace." : `Login ID: ${setupLoginId || "not configured"}. Choose a password with at least 12 characters.`}</p>{done ? <a className="primary-button auth-submit" href="/login">Continue to sign in</a> : <form onSubmit={submit}>{mode === "login" && <label>Login ID<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)}/></label>}<label>Password<div className="auth-password"><input type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "activate" ? 12 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{mode === "activate" && <label>Confirm password<input type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)}/></label>}{error && <p className="auth-error" role="alert">{error}</p>}<button className="primary-button auth-submit" disabled={busy || mode === "activate" && !token}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Save password"}</button>{mode === "login" && <p className="auth-help">Forgot password? Contact your Admin.</p>}{mode === "activate" && !token && <p className="auth-error">Open the private setup link to create the first Admin.</p>}</form>}</section></main>;
}
