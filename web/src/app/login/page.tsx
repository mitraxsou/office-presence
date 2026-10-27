"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Mark from "@/components/Mark";

type Mode = "otp" | "password";
type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState(false);
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");

  useEffect(() => {
    if (mode === "otp" && step === "code" && !deliveryFailed) {
      inputsRef.current[0]?.focus();
    }
  }, [mode, step, deliveryFailed]);

  async function sendCode() {
    setBusy(true);
    setVerifyError("");
    setDeliveryFailed(false);
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStep("code");
      setDeliveryFailed(true);
      setDigits(["", "", "", "", "", ""]);
      setVerifyError(typeof data.error === "string" ? data.error : "The code did not reach Teams");
      return;
    }
    setStep("code");
    setDeliveryFailed(false);
    setDigits(["", "", "", "", "", ""]);
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    setVerifyError("");
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setVerifyError(typeof data.error === "string" ? data.error : "That code did not match");
      return;
    }
    router.push(data.user?.role === "admin" ? "/admin/roster" : "/month");
    router.refresh();
  }

  async function signInWithPassword() {
    setBusy(true);
    setVerifyError("");
    const res = await fetch("/api/auth/password/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setVerifyError(typeof data.error === "string" ? data.error : "Email or password is incorrect");
      return;
    }
    router.push(data.user?.role === "admin" ? "/admin/roster" : "/month");
    router.refresh();
  }

  function setDigitAt(index: number, value: string) {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const next = [...digits];
      const chars = cleaned.slice(0, 6 - index).split("");
      chars.forEach((ch, i) => {
        next[index + i] = ch;
      });
      setDigits(next);
      const focusAt = Math.min(index + chars.length, 5);
      inputsRef.current[focusAt]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = cleaned.slice(-1);
    setDigits(next);
    if (cleaned && index < 5) inputsRef.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && code.length === 6) void verify();
  }

  function useDifferentEmail() {
    setStep("email");
    setDigits(["", "", "", "", "", ""]);
    setDeliveryFailed(false);
    setVerifyError("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("email");
    setDigits(["", "", "", "", "", ""]);
    setPassword("");
    setDeliveryFailed(false);
    setVerifyError("");
  }

  return (
    <div className="op-login">
      <header className="op-login-top">
        <span className="op-wordmark">
          <Mark size={20} /> Office Presence
        </span>
      </header>

      <div className="op-login-center">
        <div className="op-login-card">
          {mode === "password" ? (
            <>
              <h1 className="op-login-title">Sign in</h1>
              <p className="op-login-lead">
                Use your PwC email and the password you set in Settings.
              </p>
              <label className="op-field" htmlFor="email">
                <span className="op-field-lab">Work email</span>
                <input
                  id="email"
                  className="op-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@pwc.com"
                  autoComplete="username"
                  inputMode="email"
                  disabled={busy}
                />
              </label>
              <label className="op-field" htmlFor="password" style={{ marginTop: 16 }}>
                <span className="op-field-lab">Password</span>
                <input
                  id="password"
                  className="op-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && email.trim() && password) void signInWithPassword();
                  }}
                />
              </label>
              {verifyError ? (
                <div className="op-msg-err" role="alert" style={{ marginTop: 16 }}>
                  <span className="op-msg-err-icon" aria-hidden>
                    !
                  </span>
                  <div>
                    <b>Could not sign in</b>
                    {verifyError}
                  </div>
                </div>
              ) : null}
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 24 }}
                disabled={busy || !email.trim() || !password}
                onClick={() => void signInWithPassword()}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <span className="op-spin" aria-hidden />
                    Signing in
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
              <div className="op-login-alt">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => switchMode("otp")}>
                  Sign in with Teams code
                </button>
              </div>
            </>
          ) : step === "email" ? (
            <>
              <h1 className="op-login-title">Sign in</h1>
              <p className="op-login-lead">
                Use your PwC email. We send a 6-digit code to you in Microsoft Teams.
              </p>
              <label className="op-field" htmlFor="email-otp">
                <span className="op-field-lab">Work email</span>
                <input
                  id="email-otp"
                  className="op-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@pwc.com"
                  autoComplete="username"
                  inputMode="email"
                  disabled={busy}
                />
              </label>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 24 }}
                disabled={busy || !email.trim()}
                onClick={() => void sendCode()}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <span className="op-spin" aria-hidden />
                    Sending code
                  </>
                ) : (
                  "Send code"
                )}
              </button>
              {busy ? (
                <p className="op-login-hint">Look for a chat from Office Presence in Teams.</p>
              ) : (
                <div className="op-login-alt">
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => switchMode("password")}>
                    Sign in with password
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="op-login-title">Check Teams</h1>
              <p className="op-login-lead">Enter the 6-digit code sent to {email}.</p>

              {deliveryFailed ? (
                <div className="op-msg-err" role="alert">
                  <span className="op-msg-err-icon" aria-hidden>
                    !
                  </span>
                  <div>
                    <b>The code did not reach Teams</b>
                    Make sure Teams is signed in with {email}, then resend the code.
                  </div>
                </div>
              ) : null}

              {verifyError && !deliveryFailed ? (
                <div className="op-msg-err" role="alert">
                  <span className="op-msg-err-icon" aria-hidden>
                    !
                  </span>
                  <div>
                    <b>That code did not match</b>
                    {verifyError}
                  </div>
                </div>
              ) : null}

              <div className={`op-otp ${deliveryFailed ? "dim" : ""}`} role="group" aria-label="6-digit code">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    className="op-otp-box"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={6}
                    value={d}
                    disabled={busy || deliveryFailed}
                    onChange={(e) => setDigitAt(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {deliveryFailed ? (
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 24 }}
                  disabled={busy || !email.trim()}
                  onClick={() => void sendCode()}
                  aria-busy={busy || undefined}
                >
                  {busy ? (
                    <>
                      <span className="op-spin" aria-hidden />
                      Sending code
                    </>
                  ) : (
                    "Resend code"
                  )}
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 24 }}
                    disabled={busy || code.length !== 6}
                    onClick={() => void verify()}
                  >
                    {busy ? "Signing in" : "Sign in"}
                  </button>
                  <div className="op-login-resend">
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void sendCode()}>
                      Resend code
                    </button>
                  </div>
                </>
              )}

              <div className="op-login-alt">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={useDifferentEmail}>
                  Use a different email
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="op-login-foot">
        PwC internal pilot. Sign in with a Teams code or a password you set in Settings.
      </footer>
    </div>
  );
}
