/**
 * Mã hoá bí mật tích hợp (SePay webhook, MISA, Zalo) để lưu trong database.
 * Khoá dẫn xuất từ AUTH_SECRET bằng SHA-256 — không thêm biến môi trường mới.
 */

const FORMAT_VERSION = "v1";

async function deriveKey(masterKey: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(masterKey));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function encryptSecret(plaintext: string, masterKey: string): Promise<string> {
  const key = await deriveKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${FORMAT_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Không bao giờ throw: ciphertext hỏng hoặc AUTH_SECRET đã đổi phải hiện thành
 * "chưa cấu hình" (chuỗi rỗng), không được làm sập worker.
 */
export async function decryptSecret(ciphertext: string, masterKey: string): Promise<string> {
  try {
    const parts = ciphertext.split(".");
    if (parts.length !== 3 || parts[0] !== FORMAT_VERSION) return "";
    const [, ivB64, ctB64] = parts;
    const key = await deriveKey(masterKey);
    const plainBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivB64!) }, key, fromBase64(ctB64!));
    return new TextDecoder().decode(plainBytes);
  } catch {
    return "";
  }
}

export function secretHint(plaintext: string): string {
  return plaintext.slice(-4);
}
