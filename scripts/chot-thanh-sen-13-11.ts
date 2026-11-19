/**
 * Chụp bản chốt công nợ MỌI lớp thu tháng Thạch Khê (23 lớp) + Thành Sen (12 lớp) ngày 13/11/2026 — anh Mori: "khoá cứng ngay bây giờ, có sai thì sửa các ngày sau".
 * CHỈ ĐỌC. Ghi file (VPS) /tmp/sync-scripts/cong-no-chot-2026-11-13-lop-thang.json để tải về máy.
 * So lại sau này: BASELINE=data/cong-no-chot/2026-11-13-lop-thang.json CODES=S1,... tsx scripts/cong-no-chot.ts
 */
process.env.CODES = "T1,T2,T3,T4,T5,T7,T8,T9,T10,T11,T12,T13,T14,T15,T16,T17,T18,T19,T20,T21,T22,T23,T24,S1,S3,S4,S5,S6,S7,S8,S9,S10,S11,S31,S38";
process.env.OUT = "/app/scripts/cong-no-chot-2026-11-13-lop-thang.json"; // = /tmp/sync-scripts trên VPS
delete process.env.BASELINE;
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./cong-no-chot"); // require (không top-level await — tsx chạy dạng CJS)
