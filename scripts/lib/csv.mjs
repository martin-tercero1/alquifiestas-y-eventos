/**
 * CSV read/write shared by every script that touches the seed files.
 *
 * One parser, not one per script: the seed CSVs contain quoted fields with
 * embedded commas, and a second hand-rolled parser is a second place for a
 * product name to get silently truncated.
 */

/** Minimal RFC-4180 parser: handles quoted fields and embedded newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) =>
      Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])),
    );
}

/** Quotes a field only when it needs it, so the file stays readable by hand. */
function escapeField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serializes rows against an explicit column list, so the header is the
 * contract rather than whatever keys happened to be on the first object.
 */
export function toCsv(columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
