import { readFile } from "node:fs/promises";
import path from "node:path";

export type NoticeBlock =
  | { kind: "h1" | "h2" | "p" | "note"; text: string }
  | { kind: "ul"; items: string[] };

/** The notice lives in src/content/privacy-notice.md so privacy and legal can edit one file. */
export async function loadPrivacyNotice(retentionDays: number): Promise<string> {
  const file = path.join(process.cwd(), "src", "content", "privacy-notice.md");
  const raw = await readFile(file, "utf8");
  return raw.replaceAll("{retentionDays}", String(retentionDays));
}

/** Small markdown subset: #, ##, > note, - list, paragraphs. */
export function parseNotice(md: string): NoticeBlock[] {
  const blocks: NoticeBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
    if (list) blocks.push({ kind: "ul", items: list });
    list = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      flush();
    } else if (t.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: t.slice(3) });
    } else if (t.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: t.slice(2) });
    } else if (t.startsWith("> ")) {
      flush();
      blocks.push({ kind: "note", text: t.slice(2) });
    } else if (t.startsWith("- ")) {
      if (para.length) {
        blocks.push({ kind: "p", text: para.join(" ") });
        para = [];
      }
      (list ??= []).push(t.slice(2));
    } else {
      para.push(t);
    }
  }
  flush();
  return blocks;
}
