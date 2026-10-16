export type ParsedEntry = {
  position: number;
  title: string;
  topic: string | null;
  difficulty: string | null;
  url: string | null;
  raw: Record<string, string>;
};

const pick = (headers: string[], keys: string[]) =>
  headers.findIndex((h) => keys.some((k) => h.toLowerCase().includes(k)));

/** Turn a table (first row = headers) into entries. Never invents rows. */
export function rowsToEntries(rows: string[][]): ParsedEntry[] {
  if (rows.length < 2) return [];
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const ti = pick(headers, ["problem", "title", "question", "name"]);
  const top = pick(headers, ["topic", "pattern", "category", "section"]);
  const di = pick(headers, ["difficulty", "level"]);
  const ui = pick(headers, ["link", "url"]);
  const titleIdx = ti >= 0 ? ti : headers.length > 1 ? 1 : 0;
  const out: ParsedEntry[] = [];
  for (const r of rows.slice(1)) {
    const cells = r.map((c) => (c ?? "").trim());
    const title = cells[titleIdx];
    if (!title) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => (raw[h || `col${i}`] = cells[i] ?? ""));
    const urlCell = ui >= 0 ? cells[ui] : cells.find((c) => /^https?:\/\//.test(c));
    out.push({
      position: out.length + 1,
      title,
      topic: top >= 0 ? cells[top] || null : null,
      difficulty: di >= 0 ? cells[di] || null : null,
      url: urlCell && /^https?:\/\//.test(urlCell) ? urlCell : null,
      raw,
    });
  }
  return out;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Browser-only: extract the largest table from a .docx file. */
export async function parseDocx(file: File): Promise<string[][]> {
  const mammoth = await import("mammoth");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table")).map((t) =>
    Array.from(t.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td,th")).map((c) => c.textContent ?? ""),
    ),
  );
  if (!tables.length) return [];
  // Merge all tables that share the first table's header (multi-page tables).
  const first = tables[0] ?? [];
  const header = first[0]?.join("|");
  const merged: string[][] = first[0] ? [first[0]] : [];
  for (const t of tables) {
    const body = t[0]?.join("|") === header ? t.slice(1) : t;
    merged.push(...body);
  }
  return merged;
}
