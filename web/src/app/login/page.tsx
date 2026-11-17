"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Mark from "@/components/Mark";

type Mode = "otp" | "password";
type Step = "email" | "code";

const LOCK_KEY = "op-login-locked-until";

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Sign-in lock from a 429. The unlock time is kept in localStorage so a reload keeps the countdown. */
function useSignInLock() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(LOCK_KEY) || 0);
    if (saved > Date.now()) setUntil(saved);
    else window.localStorage.removeItem(LOCK_KEY);
  }, []);

  useEffect(() => {
    if (until <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until, now]);

  const remaining = until > now ? Math.ceil((until - now) / 1000) : 0;

  useEffect(() => {
    if (until > 0 && remaining === 0) {
      window.localStorage.removeItem(LOCK_KEY);
      setUntil(0);
    }
  }, [remaining, until]);

  function lockFor(seconds: number) {
    const next = Date.now() + Math.max(1, seconds) * 1000;
    window.localStorage.setItem(LOCK_KEY, String(next));
    setNow(Date.now());
    setUntil(next);
  }

  return { remaining, label: formatMmSs(remaining), lockFor };
}

function retryAfterFrom(res: Response, data: { retryAfterSeconds?: unknown }): number {
  const fromBody = Number(data.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const fromHeader = Number(res.headers.get("Retry-After"));
  return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 15 * 60;
}

function LockedCard({ label, mode }: { label: string; mode: Mode }) {
  return (
    <div className="op-msg-err" role="alert" style={{ marginTop: 16 }}>
      <span className="op-msg-err-icon" aria-hidden>
        !
      </span>
      <div>
        <b>Too many attempts</b>
        {mode === "password"
          ? `Wait ${label}, then try again. You can also sign in with a Teams code after that.`
          : `Wait ${label}, then try again. Ask for a new code after that.`}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const lock = useSignInLock();
  const locked = lock.remaining > 0;
  const [mode, setMode] = useState<Mode>("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState(false);
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmittedCode = useRef("");

  const code = digits.join("");

  useEffect(() => {
    if (mode === "otp" && step === "code" && !deliveryFailed) {
      inputsRef.current[0]?.focus();
    }
  }, [mode, step, deliveryFailed]);

  useEffect(() => {
    if (code.length < 6) {
      autoSubmittedCode.current = "";
      return;
    }
    if (step !== "code" || deliveryFailed || busy || locked) return;
    if (autoSubmittedCode.current === code) return;
    autoSubmittedCode.current = code;
    void verify();
  }, [code, step, deliveryFailed, busy, locked]);

  async function sendCode() {
    if (locked) return;
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
    if (res.status === 429) {
      lock.lockFor(retryAfterFrom(res, data));
      setStep("email");
      return;
    }
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
    autoSubmittedCode.current = "";
  }

  async function verify() {
    if (code.length !== 6 || locked) return;
    setBusy(true);
    setVerifyError("");
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 429) {
      lock.lockFor(retryAfterFrom(res, data));
      setDigits(["", "", "", "", "", ""]);
      return;
    }
    if (!res.ok) {
      setVerifyError(typeof data.error === "string" ? data.error : "That code did not match");
      return;
    }
    router.push(data.user?.role === "admin" ? "/admin/roster" : "/month");
    router.refresh();
  }

  async function signInWithPassword() {
    if (locked) return;
    setBusy(true);
    setVerifyError("");
    const res = await fetch("/api/auth/password/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 429) {
      lock.lockFor(retryAfterFrom(res, data));
      return;
    }
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
    autoSubmittedCode.current = "";
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("email");
    setDigits(["", "", "", "", "", ""]);
    setPassword("");
    setDeliveryFailed(false);
    setVerifyError("");
    autoSubmittedCode.current = "";
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
              {locked ? <LockedCard label={lock.label} mode="password" /> : null}
              {verifyError && !locked ? (
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
                disabled={busy || locked || !email.trim() || !password}
                onClick={() => void signInWithPassword()}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <span className="op-spin" aria-hidden />
                    Signing in
                  </>
                ) : locked ? (
                  `Sign in after ${lock.label}`
                ) : (
                  "Sign in"
                )}
              </button>
              <div className="op-login-alt">
                <button className="btn btn-ghost" type="button" disabled={busy || locked} onClick={() => switchMode("otp")}>
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
              {locked ? <LockedCard label={lock.label} mode="otp" /> : null}
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 24 }}
                disabled={busy || locked || !email.trim()}
                onClick={() => void sendCode()}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <span className="op-spin" aria-hidden />
                    Sending code
                  </>
                ) : locked ? (
                  `Send code in ${lock.label}`
                ) : (
                  "Send code"
                )}
              </button>
              {busy ? (
                <p className="op-login-hint">Look for a chat from Office Presence in Teams.</p>
              ) : (
                <div className="op-login-alt">
                  <button className="btn btn-ghost" type="button" disabled={busy || locked} onClick={() => switchMode("password")}>
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

              {locked ? <LockedCard label={lock.label} mode="otp" /> : null}

              {verifyError && !deliveryFailed && !locked ? (
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
                    disabled={busy || deliveryFailed || locked}
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
                  disabled={busy || locked || !email.trim()}
                  onClick={() => void sendCode()}
                  aria-busy={busy || undefined}
                >
                  {busy ? (
                    <>
                      <span className="op-spin" aria-hidden />
                      Sending code
                    </>
                  ) : locked ? (
                    `Send code in ${lock.label}`
                  ) : (
                    "Resend code"
                  )}
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 24 }}
                    disabled={busy || locked || code.length !== 6}
                    onClick={() => void verify()}
                  >
                    {busy ? "Signing in" : locked ? `Verify in ${lock.label}` : "Sign in"}
                  </button>
                  <div className="op-login-resend">
                    <button className="btn btn-ghost" type="button" disabled={busy || locked} onClick={() => void sendCode()}>
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
        <div>
          PwC internal pilot. Sign in with a Teams code or a password you set in Settings.
        </div>
        <div style={{ marginTop: 8 }}>
          <a href="/download" style={{ color: "inherit" }}>
            Download the Android app
          </a>
          {" · "}
          <a href="/privacy" style={{ color: "inherit" }}>
            Privacy notice
          </a>
        </div>
      </footer>
    </div>
  );
}
