"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";

function apply(mode: Mode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  localStorage.setItem("op-theme", mode);
}

function current(): Mode {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("light")) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeSwitch() {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    setMode(current());
  }, []);

  function choose(next: Mode) {
    setMode(next);
    apply(next);
  }

  return (
    <div className="op-rail-theme" role="group" aria-label="Appearance">
      <button type="button" className={mode === "light" ? "on" : ""} onClick={() => choose("light")}>
        Light
      </button>
      <button type="button" className={mode === "dark" ? "on" : ""} onClick={() => choose("dark")}>
        Dark
      </button>
    </div>
  );
}
