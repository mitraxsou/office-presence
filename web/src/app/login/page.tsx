"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Mark from "@/components/Mark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setMessage("");
    setMessageKind("");
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not send code");
      setMessageKind("error");
      return;
    }
    setMessage(data.message ?? "Check Teams for your code");
    setMessageKind("ok");
    setStep("code");
  }

  async function verify() {
    setBusy(true);
    setMessage("");
    setMessageKind("");
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Invalid code");
      setMessageKind("error");
      return;
    }
    router.push(data.user?.role === "admin" ? "/admin" : "/me");
    router.refresh();
  }

  return (
    <main className="login-main">
      <div className="hero-mark">
        <Mark size={88} animated />
      </div>
      <div className="card card-brand">
        <span className="card-title">PwC</span>
        <h1>Office Presence</h1>
        <p className="lead">
          Sign in with your PwC email. The code arrives in Microsoft Teams.
        </p>

        {step === "email" ? (
          <div className="form-stack">
            <p className="login-step">Step 1 of 2: Email</p>
            <label htmlFor="email">PwC email</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@pwc.com"
              autoComplete="username"
              inputMode="email"
              disabled={busy}
            />
            <div className="btn-row">
              <button
                className="btn btn-primary btn-block"
                disabled={busy || !email.trim()}
                onClick={sendCode}
              >
                {busy ? "Sending..." : "Send code"}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <p className="login-step">Step 2 of 2: Teams code</p>
            <p className="muted" style={{ margin: "0 0 0.75rem" }}>
              Code sent to <strong>{email}</strong>
            </p>
            <label htmlFor="code">Teams code</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
            />
            <div className="btn-row">
              <button
                className="btn btn-primary"
                disabled={busy || !code.trim()}
                onClick={verify}
              >
                {busy ? "Verifying..." : "Verify code"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={sendCode}
              >
                Resend code
              </button>
            </div>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: "0.75rem" }}
              disabled={busy}
              onClick={() => {
                setStep("email");
                setCode("");
                setMessage("");
                setMessageKind("");
              }}
            >
              Change email
            </button>
          </div>
        )}

        {message ? (
          <p className={`status-msg ${messageKind}`}>{message}</p>
        ) : null}
      </div>
    </main>
  );
}
