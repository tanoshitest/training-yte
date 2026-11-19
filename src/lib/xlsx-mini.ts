/**
 * Đọc / ghi .xlsx không dùng exceljs — gói đó kéo ~100 dependency, máy Coolify
 * ~1GB RAM chết lúc `next build` (dò dấu vết / typecheck).
 *
 * File là ZIP: ghi không nén (Excel mở được), đọc được cả file Excel đã nén DEFLATE
 * và shared strings.
 */
import { crc32, inflateRawSync } from "node:zlib";

export type Sheet = { name: string; rows: string[][] };

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlUnescape(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function colLetter(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colIndex(ref: string) {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n;
}

function rowIndex(ref: string) {
  return Number(ref.replace(/\D+/g, "")) || 0;
}

function sheetXml(rows: string[][]) {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === "") return "";
          const ref = `${colLetter(c + 1)}${r + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

function zipStore(files: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const payload = Buffer.concat([local, name, file.data]);
    locals.push(payload);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += payload.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

export function writeXlsx(sheets: Sheet[]) {
  const files: { name: string; data: Buffer }[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          sheets
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
            )
            .join("") +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>` +
          sheets
            .map(
              (sheet, i) =>
                `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
            )
            .join("") +
          `</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets
            .map(
              (_, i) =>
                `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
            )
            .join("") +
          `</Relationships>`,
      ),
    },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(sheet.rows), "utf8"),
    })),
  ];
  return zipStore(files);
}

function readU32(buf: Buffer, offset: number) {
  return buf.readUInt32LE(offset);
}

function readU16(buf: Buffer, offset: number) {
  return buf.readUInt16LE(offset);
}

function unzip(buf: Buffer) {
  const files = new Map<string, string>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (readU32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Không phải file .xlsx hợp lệ.");

  const count = readU16(buf, eocd + 10);
  let offset = readU32(buf, eocd + 16);

  for (let i = 0; i < count; i++) {
    if (readU32(buf, offset) !== 0x02014b50) break;
    const method = readU16(buf, offset + 10);
    const compSize = readU32(buf, offset + 20);
    const nameLen = readU16(buf, offset + 28);
    const extraLen = readU16(buf, offset + 30);
    const commentLen = readU16(buf, offset + 32);
    const localOff = readU32(buf, offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");

    const localNameLen = readU16(buf, localOff + 26);
    const localExtra = readU16(buf, localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    const data =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : null;
    if (data && (name.endsWith(".xml") || name.endsWith(".rels"))) {
      files.set(name.replace(/\\/g, "/"), data.toString("utf8"));
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) return [];
  const out: string[] = [];
  const si = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
  for (const match of si) {
    const texts = [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
    out.push(xmlUnescape(texts.map((t) => t[1]).join("")));
  }
  return out;
}

function parseSheet(xml: string, shared: string[]) {
  const grid: string[][] = [];
  for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = cell[1];
    const inner = cell[2];
    const ref = attrs.match(/\br="([^"]+)"/)?.[1];
    if (!ref) continue;
    const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
    let value = "";
    if (type === "inlineStr") {
      const texts = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
      value = xmlUnescape(texts.map((t) => t[1]).join(""));
    } else if (type === "s") {
      const idx = Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      value = shared[idx] ?? "";
    } else {
      value = xmlUnescape((inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "").trim());
    }
    const r = rowIndex(ref);
    const c = colIndex(ref);
    if (!r || !c) continue;
    if (!grid[r - 1]) grid[r - 1] = [];
    grid[r - 1][c - 1] = value;
  }
  const dense: string[][] = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const next: string[] = [];
    for (let j = 0; j < row.length; j++) next[j] = row[j] ?? "";
    dense.push(next);
  }
  return dense;
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
}

function workbookSheets(xml: string) {
  return [...xml.matchAll(/<sheet\b([^>]+)\/>/g)]
    .map((match) => ({
      name: xmlUnescape(attr(match[1], "name") ?? ""),
      rid: attr(match[1], "r:id") ?? "",
    }))
    .filter((sheet) => sheet.name && sheet.rid);
}

function relTargets(xml: string | undefined) {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const match of xml.matchAll(/<Relationship\b([^>]+)\/>/g)) {
    const id = attr(match[1], "Id");
    const target = attr(match[1], "Target");
    if (id && target) map.set(id, target.replace(/^\//, ""));
  }
  return map;
}

export function readXlsx(buf: Buffer): Sheet[] {
  const files = unzip(buf);
  const workbookXml = files.get("xl/workbook.xml");
  if (!workbookXml) throw new Error("Không đọc được workbook.xml.");

  const targets = relTargets(files.get("xl/_rels/workbook.xml.rels"));
  const shared = parseSharedStrings(files.get("xl/sharedStrings.xml"));

  return workbookSheets(workbookXml).map((sheet) => {
    const target = targets.get(sheet.rid) ?? "worksheets/sheet1.xml";
    const path = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const xml = files.get(path.replace(/\\/g, "/"));
    return { name: sheet.name, rows: xml ? parseSheet(xml, shared) : [] };
  });
}
