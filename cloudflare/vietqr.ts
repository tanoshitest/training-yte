import { encode, renderSVG } from "uqr";

export interface VietQrInput {
  bankId: string;
  accountNumber: string;
  accountName?: string;
  amount?: number;
  addInfo?: string;
}

/** Decoded from QRcodebank.jpg — BIDV VietQR of the STEPS receiving account. */
export const STEPS_BIDV_ACCOUNT = "8686838888";
export const OFFICIAL_STEPS_VIETQR =
  "00020101021138540010A00000072701240006970418011086868388880208QRIBFTTA53037045802VN6304E374";

function tlv(id: string, value: string) {
  const text = String(value ?? "");
  if (!text) return "";
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

export function crc16Ccitt(input: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function canonicalizeVietQrAccount(bankId: string, accountNumber: string) {
  const bin = String(bankId || "").replace(/\D/g, "").slice(0, 6);
  const account = String(accountNumber || "").replace(/\s+/g, "");
  if (bin === "970418" && (account === "868683888" || account === STEPS_BIDV_ACCOUNT || !account)) {
    return STEPS_BIDV_ACCOUNT;
  }
  return account;
}

export function buildVietQrPayload(input: VietQrInput) {
  const bankId = String(input.bankId || "").replace(/\D/g, "").slice(0, 6);
  const accountNumber = canonicalizeVietQrAccount(bankId, input.accountNumber);
  const addInfo = String(input.addInfo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25);
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  if (bankId.length !== 6 || !accountNumber) return "";

  const consumer = tlv("00", bankId) + tlv("01", accountNumber);
  const merchant = tlv("00", "A000000727") + tlv("01", consumer) + tlv("02", "QRIBFTTA");
  const extra = addInfo ? tlv("08", addInfo) : "";
  const body = [
    tlv("00", "01"),
    tlv("01", amount || addInfo ? "12" : "11"),
    tlv("38", merchant),
    tlv("53", "704"),
    amount ? tlv("54", String(amount)) : "",
    tlv("58", "VN"),
    extra ? tlv("62", extra) : "",
    "6304",
  ].join("");
  return `${body}${crc16Ccitt(body)}`;
}

export function vietQrSvg(input: VietQrInput) {
  const payload = buildVietQrPayload(input);
  if (!payload) return "";
  return renderSVG(payload, { ecc: "M", border: 2, pixelSize: 6 });
}

export function vietQrModules(input: VietQrInput) {
  const payload = buildVietQrPayload(input);
  if (!payload) return null;
  return encode(payload, { ecc: "M", border: 1 });
}
