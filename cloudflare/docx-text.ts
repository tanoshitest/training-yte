/**
 * Lấy chữ từ file .docx mà không cần thư viện: .docx là file zip, nội dung nằm ở word/document.xml.
 * Dùng DecompressionStream có sẵn trên Node ≥ 18 và Workers.
 */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Đọc một entry của zip theo tên; trả undefined nếu không có. */
async function readZipEntry(zip: Uint8Array, wanted: string): Promise<Uint8Array | undefined> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("File không phải .docx hợp lệ.");
  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < entryCount; n += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(zip.subarray(pointer + 46, pointer + 46 + nameLength));
    if (name === wanted) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = zip.subarray(start, start + compressedSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error("File .docx dùng kiểu nén không hỗ trợ.");
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** Chữ của .docx, mỗi đoạn một dòng (tab và xuống dòng mềm giữ lại). */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const entry = await readZipEntry(bytes, "word/document.xml");
  if (!entry) throw new Error("File .docx không có nội dung văn bản.");
  const xml = new TextDecoder().decode(entry);
  const lines: string[] = [];
  for (const paragraph of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = decodeXmlEntities(
      paragraph
        .replace(/<w:tab\s*\/>/g, "\t")
        .replace(/<w:br\s*\/>/g, "\n")
        .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, "$1\u0001")
        .replace(/<[^>]+>/g, "")
        .replace(/\u0001/g, ""),
    );
    if (text.trim()) lines.push(text.trimEnd());
  }
  return lines.join("\n");
}
