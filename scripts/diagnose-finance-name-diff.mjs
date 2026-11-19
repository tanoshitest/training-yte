import { readFileSync } from "node:fs";

const BASE = process.env.STEPS_PROD_URL
  || "http://sqwjepnuzk3jz7x4xmap9hcn.149.28.131.241.sslip.io";
const EMAIL = process.env.STEPS_PROD_EMAIL;
const PASSWORD = process.env.STEPS_PROD_PASSWORD;
const backupPath = process.argv[2];

if (!EMAIL || !PASSWORD || !backupPath) throw new Error("Thiếu thông tin đăng nhập hoặc đường dẫn snapshot.");

async function request(pathname, cookie, init = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${pathname}: ${response.status}`);
  return { body, response };
}

function differences(before, after, path = "$") {
  if (Object.is(before, after)) return [];
  if (typeof before !== "object" || before === null || typeof after !== "object" || after === null) {
    return [{ path, before, after }];
  }
  if (Array.isArray(before) !== Array.isArray(after)) return [{ path, before, after }];
  const keys = Array.isArray(before)
    ? [...Array(Math.max(before.length, after.length)).keys()].map(String)
    : [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((key) => differences(before[key], after[key], `${path}.${key}`));
}

const snapshot = JSON.parse(readFileSync(backupPath, "utf8"));
const login = await request("/api/login", "", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0] || "";
const current = (await request("/api/finance", cookie)).body.finance || {};
const diffs = differences(snapshot.finance, current);
const leafCounts = {};
for (const diff of diffs) {
  const leaf = diff.path.split(".").at(-1);
  leafCounts[leaf] = (leafCounts[leaf] || 0) + 1;
}
console.log(JSON.stringify({
  differenceCount: diffs.length,
  leafCounts,
  allDifferencesAreNames: diffs.every((diff) => /(?:studentName|payerName|buyerName|description|note|content|summary|name)$/i.test(diff.path.split(".").at(-1))),
  sample: diffs.slice(0, 200),
}, null, 2));
