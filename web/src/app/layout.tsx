import type { Metadata, Viewport } from "next";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Office Presence",
  description: "Office points and presence for PwC teams",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
    { media: "(prefers-color-scheme: light)", color: "#F4F4F4" },
  ],
};

const themeBoot = `try{var t=localStorage.getItem("op-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.classList.add(t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
