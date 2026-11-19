import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadApiWithRetry(fetchImpl: typeof fetch) {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__bootstrapRetryTest = { apiWithRetry };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/thu-chi" },
    history: { pushState: () => {}, replaceState: () => {} },
    fetch: fetchImpl,
    Response,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as typeof context & { __bootstrapRetryTest: { apiWithRetry: (path: string, options?: object, attempts?: number, baseDelay?: number) => Promise<any> } }).__bootstrapRetryTest.apiWithRetry;
}

test("bootstrap GET retries transient network failures", async () => {
  let attempts = 0;
  const apiWithRetry = loadApiWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await apiWithRetry("/api/bootstrap", {}, 4, 0);
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
});

test("bootstrap GET does not retry authentication errors", async () => {
  let attempts = 0;
  const apiWithRetry = loadApiWithRetry(async () => {
    attempts += 1;
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  });

  await assert.rejects(() => apiWithRetry("/api/bootstrap", {}, 4, 0), (error: any) => error.status === 401);
  assert.equal(attempts, 1);
});
