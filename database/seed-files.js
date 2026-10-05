// Helpers used by seed.js to create small but real files for the demo data,
// so "download" works for every seeded file row.
//   makePdf(title, paragraphs) -> Buffer with a valid one-page PDF
//   makeText(lines)            -> Buffer with plain text
//   makeCsv(rows)              -> Buffer with CSV text

// PDF text must be plain ASCII here, so replace common special characters
function toAscii(text) {
  return String(text)
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, '');
}

// Escapes the characters that have a special meaning inside PDF strings
function escapePdfText(text) {
  return toAscii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Splits a paragraph into lines of at most maxChars characters
function wrap(text, maxChars = 88) {
  const lines = [];
  let line = '';
  for (const word of toAscii(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds a minimal, valid one-page PDF (A4) with a title and some paragraphs.
 * The byte offsets in the "xref" table are calculated so PDF readers open it without warnings.
 */
export function makePdf(title, paragraphs = []) {
  const commands = [`BT /F2 18 Tf 56 780 Td (${escapePdfText(title)}) Tj ET`];
  let y = 745;
  for (const paragraph of paragraphs) {
    for (const line of wrap(paragraph)) {
      if (y < 60) break; // stay on one page
      commands.push(`BT /F1 11 Tf 56 ${y} Td (${escapePdfText(line)}) Tj ET`);
      y -= 16;
    }
    y -= 10; // space between paragraphs
  }
  const stream = commands.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// Plain text file (UTF-8, Windows-friendly line endings)
export function makeText(lines) {
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

// CSV file from an array of rows (each row is an array of values)
export function makeCsv(rows) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return Buffer.from(rows.map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n', 'utf8');
}
