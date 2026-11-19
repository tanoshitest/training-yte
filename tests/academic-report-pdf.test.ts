import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { academicReportDownloadName, buildAcademicReportPdf } from "../cloudflare/academic-report-pdf";

function loadFont(name: string) {
  return fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)).buffer;
}

/** Gộp các content stream đã giải nén để soi lệnh vẽ (màu nền, nét) của phiếu. */
function drawingCommands(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  let commands = "";
  for (let index = 0; index < buffer.length - 6; index += 1) {
    if (buffer.subarray(index, index + 6).toString("latin1") !== "stream") continue;
    let start = index + 6;
    if (buffer[start] === 13) start += 1;
    if (buffer[start] === 10) start += 1;
    try {
      const inflated = zlib.inflateSync(buffer.subarray(start), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      const chunk = inflated.toString("latin1");
      if (chunk.includes(" rg")) commands += chunk;
    } catch {
      // Stream không phải FlateDecode (font, ảnh) thì bỏ qua.
    }
  }
  return commands;
}

function countOf(commands: string, needle: string) {
  return commands.split(needle).length - 1;
}

function renderSheet(
  rows: Parameters<typeof buildAcademicReportPdf>[1]["rows"],
  overrides: Partial<Parameters<typeof buildAcademicReportPdf>[1]> = {},
) {
  return buildAcademicReportPdf(
    { regular: loadFont("Roboto-Regular.ttf"), medium: loadFont("Roboto-Medium.ttf") },
    {
      className: "S1 Starters",
      sequence: "4",
      dateLabel: "13/09/2026",
      timeLabel: "09:00–11:00",
      teacherName: "Cô Vân",
      columns: [{ id: "listen", name: "Nghe" }],
      rows,
      ...overrides,
    },
  );
}

test("academic report PDF uses the popup letterhead and attendance text", async () => {
  const logoPng = new Uint8Array(fs.readFileSync(new URL("../cloudflare/public/steps-wordmark.png", import.meta.url)));
  const bytes = await buildAcademicReportPdf(
    { regular: loadFont("Roboto-Regular.ttf"), medium: loadFont("Roboto-Medium.ttf") },
    {
      className: "S1 Starters",
      sequence: "4",
      dateLabel: "13/09/2026",
      timeLabel: "09:00–11:00",
      teacherName: "Cô Vân",
      columns: [{ id: "btvn", name: "BTVN" }],
      rows: [
        { code: "HV001", fullName: "Khánh An", status: "Có mặt", clipDone: true, vocabulary: "32/43", scores: ["56/65"], note: "Tiến bộ tốt" },
        { code: "HV002", fullName: "Bảo Châu", status: "Vắng phép", clipDone: false, vocabulary: "—", scores: ["—"], note: "—" },
      ],
      logoPng,
    },
  );

  assert.equal(bytes[0], 0x25);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
  assert.ok(bytes.byteLength > 4000);
  assert.equal(academicReportDownloadName("S1 Starters", "13/09/2026", "4"), "bao-cao-hoc-vu-S1-Starters-13092026-buoi-4.pdf");
});

test("clip column is stroked as a vector check because Roboto has no ✓ glyph", async () => {
  const bytes = await renderSheet([
    { code: "HV001", fullName: "Khánh An", status: "Có mặt", clipDone: true, vocabulary: "8/10", scores: ["8/10"], note: "—" },
    { code: "HV002", fullName: "Bảo Châu", status: "Có mặt", clipDone: true, vocabulary: "8/10", scores: ["8/10"], note: "—" },
    { code: "HV003", fullName: "Gia Hân", status: "Vắng phép", clipDone: false, vocabulary: "—", scores: ["—"], note: "—" },
  ]);
  const commands = drawingCommands(bytes);

  // Mỗi dấu tick là hai nét bo đầu màu xanh, chỉ vẽ cho học viên đã làm clip.
  assert.equal(countOf(commands, "0.082 0.502 0.239 RG"), 4);
  assert.equal(countOf(commands, "1 J"), 4);
});

test("worksheet column renders check marks when the class tracks worksheets", async () => {
  const rows = [
    { code: "HV001", fullName: "Khánh An", status: "Có mặt", clipDone: true, worksheetDone: true, vocabulary: "8/10", scores: ["8/10"], note: "—" },
    { code: "HV002", fullName: "Bảo Châu", status: "Có mặt", clipDone: true, worksheetDone: false, vocabulary: "8/10", scores: ["8/10"], note: "—" },
  ];
  const bytes = await renderSheet(rows, {
    showWorksheet: true,
    columnOrder: ["status", "clip", "worksheet", "vocabulary", "assessment:listen", "note"],
  });
  const commands = drawingCommands(bytes);

  // 3 dấu tick (clip×2 + worksheet×1) × 2 nét mỗi dấu.
  assert.equal(countOf(commands, "0.082 0.502 0.239 RG"), 6);
});

test("academic session route forwards worksheet flags so the PDF keeps the column", () => {
  const worker = fs.readFileSync(new URL("../cloudflare/worker.ts", import.meta.url), "utf8");
  const route = worker.match(/\/api\/reports\/academic-session[\s\S]*?buildAcademicReportPdf[\s\S]*?\}\s*,\s*\);/)?.[0] || "";

  assert.match(route, /"worksheet"/, "allowedColumnKeys phải chứa worksheet");
  assert.match(route, /worksheetDone: Boolean\(item\.worksheetDone\)/, "rows phải map worksheetDone");
  assert.match(route, /showWorksheet: body\.showWorksheet === true/, "input phải truyền showWorksheet");
});

test("academic session route keeps the full comment instead of cutting it short", () => {
  const worker = fs.readFileSync(new URL("../cloudflare/worker.ts", import.meta.url), "utf8");
  const route = worker.match(/\/api\/reports\/academic-session[\s\S]*?buildAcademicReportPdf[\s\S]*?\}\s*,\s*\);/)?.[0] || "";
  const cap = Number(route.match(/note: String\(item\.note \|\| "—"\)\.trim\(\)\.slice\(0, (\d+)\)/)?.[1] || 0);

  // Ô nhập điểm danh cho 300 ký tự; PDF phải nhận đủ để tự xuống dòng, không cắt
  // mất phần cuối nhận xét (dòng cuối trên ảnh bị cụt ở mốc 180 cũ).
  assert.ok(cap >= 300, `nhận xét trên PDF phải giữ đủ 300 ký tự, đang cắt ở ${cap}`);
});

test("score cells are tinted by band and the colour legend is printed below the table", async () => {
  const bytes = await renderSheet([
    // 9/18 và 8/16 đúng mốc 50%, 79/100 sát dưới mốc 80%, 8/10 đúng mốc 80%.
    { code: "HV001", fullName: "Dưới 50%", status: "Có mặt", clipDone: false, vocabulary: "7/18", scores: ["4"], note: "—" },
    { code: "HV002", fullName: "Đúng 50%", status: "Có mặt", clipDone: false, vocabulary: "9/18", scores: ["8/16"], note: "—" },
    { code: "HV003", fullName: "Sát 80%", status: "Có mặt", clipDone: false, vocabulary: "79/100", scores: ["8/10"], note: "—" },
    { code: "HV004", fullName: "Không phải điểm", status: "Vắng phép", clipDone: false, vocabulary: "Chưa kiểm tra", scores: ["—"], note: "—" },
  ]);
  const commands = drawingCommands(bytes);

  // Mỗi màu = số ô điểm trong mức đó + 1 ô chú thích dưới bảng.
  assert.equal(countOf(commands, "1 0 0 rg"), 2 + 1);
  assert.equal(countOf(commands, "1 1 0 rg"), 3 + 1);
  assert.equal(countOf(commands, "0 1 0 rg"), 1 + 1);
});

test("colour legend is left out when the sheet has no score column", async () => {
  const bytes = await renderSheet(
    [{ code: "HV001", fullName: "Khánh An", status: "Có mặt", clipDone: true, vocabulary: "—", scores: [], note: "—" }],
    { columns: [], showVocabulary: false },
  );
  const commands = drawingCommands(bytes);

  assert.equal(countOf(commands, "1 0 0 rg"), 0);
  assert.equal(countOf(commands, "1 1 0 rg"), 0);
  assert.equal(countOf(commands, "0 1 0 rg"), 0);
});

test("long comments wrap into taller rows instead of being shortened", async () => {
  const shortRows = Array.from({ length: 12 }, (_, index) => ({
    code: `HV${index + 1}`,
    fullName: `Học viên ${index + 1}`,
    status: "Có mặt",
    clipDone: false,
    vocabulary: "8/10",
    scores: ["8/10"],
    note: "Tiến bộ tốt",
  }));
  const longRows = shortRows.map((row) => ({
    ...row,
    // A4 ngang có cột Nhận xét rộng hơn — nhận xét phải đủ dài để tràn sang trang sau.
    note: "Chú ý thái độ học ở nhà, rất hay quên bài và từ vựng học chưa tốt; gia đình cần nhắc con ôn bài đều đặn trước mỗi buổi học. ".repeat(3).trim(),
  }));
  const [shortPdf, longPdf] = await Promise.all([renderSheet(shortRows), renderSheet(longRows)]);
  const shortDocument = await PDFDocument.load(shortPdf);
  const longDocument = await PDFDocument.load(longPdf);

  assert.equal(shortDocument.getPageCount(), 1);
  assert.ok(longDocument.getPageCount() > shortDocument.getPageCount());
});
