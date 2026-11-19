const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Đọc một nhóm 3 chữ số (0–999). `pad` khi nhóm này không phải nhóm cao nhất. */
function readTriple(n: number, pad: boolean): string {
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  const parts: string[] = [];

  if (hundred > 0) {
    parts.push(`${DIGITS[hundred]} trăm`);
  } else if (pad && n > 0) {
    parts.push("không trăm");
  }

  if (ten > 1) {
    parts.push(`${DIGITS[ten]} mươi`);
    if (unit === 1) parts.push("mốt");
    else if (unit === 4 && ten >= 2) parts.push("tư");
    else if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push("mười");
    if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (unit > 0) {
    if (hundred > 0 || pad) parts.push("lẻ");
    parts.push(DIGITS[unit]);
  }

  return parts.join(" ");
}

const SCALES = ["", "nghìn", "triệu", "tỷ"];

/** 4800000 → "Bốn triệu tám trăm nghìn đồng chẵn" */
export function moneyInWords(value: number | string): string {
  const n = Math.round(Math.abs(typeof value === "number" ? value : Number(value)));
  if (!Number.isFinite(n) || n === 0) return "Không đồng";

  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const highest = groups.length - 1;
  const parts: string[] = [];
  for (let i = highest; i >= 0; i -= 1) {
    const group = groups[i];
    if (group === 0) continue;
    const text = readTriple(group, i < highest);
    const scale = SCALES[i] ?? "";
    parts.push(scale ? `${text} ${scale}` : text);
  }

  const raw = `${parts.join(" ")} đồng chẵn`.replace(/\s+/g, " ").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
