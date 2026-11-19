/**
 * So sánh sâu hai khối JSON và liệt kê đường dẫn khác biệt.
 * Dùng để chứng minh bản dựng lại từ bảng quan hệ giống hệt khối JSON gốc,
 * thay vì rà bằng mắt.
 */

export interface JsonDifference {
  path: string;
  left: string;
  right: string;
}

function describe(value: unknown) {
  if (value === undefined) return "(vắng mặt)";
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function kindOf(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function diffJson(left: unknown, right: unknown, path = "$", found: JsonDifference[] = [], limit = 200): JsonDifference[] {
  if (found.length >= limit) return found;

  const leftKind = kindOf(left);
  const rightKind = kindOf(right);
  if (leftKind !== rightKind) {
    found.push({ path, left: describe(left), right: describe(right) });
    return found;
  }

  if (leftKind === "array") {
    const a = left as unknown[];
    const b = right as unknown[];
    if (a.length !== b.length) {
      found.push({ path: `${path}.length`, left: String(a.length), right: String(b.length) });
    }
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      diffJson(a[index], b[index], `${path}[${index}]`, found, limit);
      if (found.length >= limit) return found;
    }
    return found;
  }

  if (leftKind === "object") {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const hasLeft = Object.prototype.hasOwnProperty.call(a, key);
      const hasRight = Object.prototype.hasOwnProperty.call(b, key);
      if (hasLeft !== hasRight) {
        found.push({ path: `${path}.${key}`, left: hasLeft ? describe(a[key]) : "(vắng mặt)", right: hasRight ? describe(b[key]) : "(vắng mặt)" });
        continue;
      }
      diffJson(a[key], b[key], `${path}.${key}`, found, limit);
      if (found.length >= limit) return found;
    }
    return found;
  }

  if (left !== right) found.push({ path, left: describe(left), right: describe(right) });
  return found;
}
