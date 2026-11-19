/**
 * Học liệu Portal (ảnh flashcard, ảnh trang sách, âm thanh, video bài giảng) lưu trên đĩa VPS.
 *
 * Worker không tự đọc/ghi đĩa: VPS gắn binding `MEDIA` (cloudflare/vps-server.ts) ghi luồng
 * thân request ra thư mục `MEDIA_DIR` (volume Docker `media-data`, không mất khi deploy). File
 * được phục vụ công khai ở `/media/<đường dẫn>` với tên ngẫu nhiên (UUID) nên không đoán được.
 * Môi trường không có binding (Cloudflare demo) trả 501 thay vì im lặng mất dữ liệu.
 */

export type PortalMediaKind = "image" | "audio" | "video" | "document";

export interface PortalMediaStore {
  /** Ghi luồng ra file mới; vượt `maxBytes` thì xóa phần đã ghi và ném lỗi `MEDIA_TOO_LARGE`. */
  put(body: ReadableStream<Uint8Array>, options: { ext: string; maxBytes: number }): Promise<{ path: string; bytes: number }>;
}

export const PORTAL_MEDIA_TYPES: Record<string, { kind: PortalMediaKind; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp3": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/x-wav": { kind: "audio", ext: "wav" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
  "audio/webm": { kind: "audio", ext: "weba" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
  // Phiếu bài tập về nhà (nút "Tải bài tập" trong Nhiệm vụ về nhà).
  "application/pdf": { kind: "document", ext: "pdf" },
};

export const PORTAL_MEDIA_LIMITS: Record<PortalMediaKind, number> = {
  image: 10 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  video: 600 * 1024 * 1024,
  document: 30 * 1024 * 1024,
};

const LIMIT_LABEL: Record<PortalMediaKind, string> = { image: "10MB", audio: "30MB", video: "600MB", document: "30MB" };

/** Đuôi file → loại MIME khi trình duyệt không gửi Content-Type chuẩn (vd. .mov, .m4a). */
const EXT_FALLBACK: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", pdf: "application/pdf",
};

export function portalMediaType(contentType: string | null, fileName = "") {
  const mime = String(contentType || "").split(";")[0]!.trim().toLowerCase();
  if (PORTAL_MEDIA_TYPES[mime]) return { mime, ...PORTAL_MEDIA_TYPES[mime]! };
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  const fallback = EXT_FALLBACK[ext];
  return fallback ? { mime: fallback, ...PORTAL_MEDIA_TYPES[fallback]! } : null;
}

type Json = (body: unknown, status?: number) => Response;

/** POST /api/media — quản trị, giáo viên, kế toán/hành chính (kiểm quyền ở worker); thân request là chính file (không multipart), tên file ở X-File-Name. */
export async function handlePortalMediaUpload(request: Request, store: PortalMediaStore | undefined, json: Json) {
  if (!store) return json({ error: "Máy chủ này chưa bật lưu học liệu (chỉ có trên VPS)." }, 501);
  let fileName = "";
  try { fileName = decodeURIComponent(request.headers.get("x-file-name") || ""); } catch { fileName = ""; }
  const type = portalMediaType(request.headers.get("content-type"), fileName);
  if (!type) return json({ error: "Chỉ nhận ảnh (JPG, PNG, WebP, GIF), âm thanh (MP3, M4A, WAV, OGG) video (MP4, WebM, MOV) hoặc PDF." }, 415);
  const limit = PORTAL_MEDIA_LIMITS[type.kind];
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) return json({ error: `File quá lớn (tối đa ${LIMIT_LABEL[type.kind]}).` }, 413);
  if (!request.body) return json({ error: "File rỗng." }, 400);
  try {
    const saved = await store.put(request.body, { ext: type.ext, maxBytes: limit });
    if (!saved.bytes) return json({ error: "File rỗng." }, 400);
    return json({ ok: true, url: `/media/${saved.path}`, kind: type.kind, mime: type.mime, bytes: saved.bytes, name: fileName.slice(0, 200) }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "MEDIA_TOO_LARGE") return json({ error: `File quá lớn (tối đa ${LIMIT_LABEL[type.kind]}).` }, 413);
    throw error;
  }
}

/** Loại nội dung khi phục vụ file theo đuôi (dùng ở vps-server). */
export function portalMediaContentType(path: string) {
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (ext === "weba") return "audio/webm";
  return EXT_FALLBACK[ext] || "application/octet-stream";
}

/** Đường dẫn tương đối hợp lệ: chỉ portal/YYYYMM/<uuid>.<ext> — chặn ../ và mọi thứ khác. */
export function isPortalMediaPath(path: string) {
  return /^portal\/\d{6}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp3|m4a|wav|ogg|weba|mp4|webm|mov|pdf)$/.test(path);
}
