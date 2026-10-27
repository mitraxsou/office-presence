// Example only: merge into the existing app/layout.tsx.
// Theme comes from a cookie so the server renders the right class: no flash, no client script.
// "system" (no cookie) falls back to prefers-color-scheme in tokens.css.
import { cookies } from "next/headers";
import "./tokens.css";
import "./globals.css";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("op-theme")?.value; // Next 15: cookies() is async
  const cls = theme === "dark" ? "dark" : theme === "light" ? "light" : undefined;
  return (
    <html lang="en" className={cls}>
      <body>{children}</body>
    </html>
  );
}
