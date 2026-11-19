import assert from "node:assert/strict";
import test from "node:test";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { handleReadAloudCheck, normalizeWords, scoreReading, starsFor } from "../cloudflare/read-aloud";

const json = (body: unknown, status = 200) => Response.json(body, { status });

test("so khớp từ: đúng hết 100, thiếu từ trừ điểm, đọc thêm linh tinh trừ nhẹ", () => {
  assert.deepEqual(normalizeWords("I see a RED apple!"), ["i", "see", "a", "red", "apple"]);
  assert.equal(scoreReading("I see a red apple.", "i see a red apple").score, 100);
  const miss = scoreReading("I see a red apple.", "I see red apple");
  assert.equal(miss.score, 80);
  assert.deepEqual(miss.missed, ["a"]);
  assert.ok(scoreReading("red", "red red red red").score < 100);
  assert.equal(scoreReading("blue", "").score, 0);
  assert.deepEqual([starsFor(90), starsFor(70), starsFor(40), starsFor(10)], [3, 2, 1, 0]);
});

async function envWithAi(enabled = true) {
  const key = await encryptSecret("sk-test", "secret");
  const store = new Map<string, unknown>([["integrations:steps-demo", { ai: { enabled, model: "gpt-test", apiKeyEncrypted: key } }]]);
  return { STEPS_LMS_DATA: { get: async <T>(k: string) => (store.get(k) as T) ?? null }, AUTH_SECRET: "secret", OPENAI_BASE_URL: "http://ai.local/v1" };
}

const audio = Buffer.from(new Uint8Array(4000).fill(7)).toString("base64");
const req = (body: unknown) => new Request("http://x/api/portal/read-check", { method: "POST", body: JSON.stringify(body) });

test("chấm đọc: nghe → so khớp → AI nhận xét (điểm AI chỉ chỉnh ±10)", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sk-test");
    if (String(url).endsWith("/audio/transcriptions")) return Response.json({ text: "I see red apple" });
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ score: 99, feedback: "Em đọc rõ lắm! Nhớ đọc chữ 'a' nhé.", practice_words: ["a"] }) }] }] });
  }) as typeof fetch;
  const res = await handleReadAloudCheck(req({ text: "I see a red apple.", audioBase64: audio, mime: "audio/webm" }), await envWithAi(), "u1", json, fetchImpl);
  const body = await res.json() as { score: number; stars: number; transcript: string; feedback: string; practiceWords: string[] };
  assert.equal(res.status, 200);
  assert.equal(body.transcript, "I see red apple");
  assert.equal(body.score, 90, "80 khớp từ + tối đa 10");
  assert.equal(body.stars, 3);
  assert.deepEqual(body.practiceWords, ["a"]);
  assert.deepEqual(calls, ["http://ai.local/v1/audio/transcriptions", "http://ai.local/v1/responses"]);
});

test("AI nhận xét lỗi vẫn trả điểm khớp từ + lời nhận xét mặc định; chưa bật AI → 503", async () => {
  const fetchImpl = (async (url: string | URL) => String(url).endsWith("/audio/transcriptions") ? Response.json({ text: "blue" }) : new Response("x", { status: 500 })) as typeof fetch;
  const ok = await handleReadAloudCheck(req({ text: "blue", audioBase64: audio, mime: "audio/webm" }), await envWithAi(), "u2", json, fetchImpl);
  const body = await ok.json() as { score: number; feedback: string };
  assert.equal(body.score, 100);
  assert.match(body.feedback, /Tuyệt vời/);
  const off = await handleReadAloudCheck(req({ text: "blue", audioBase64: audio, mime: "audio/webm" }), await envWithAi(false), "u3", json, fetchImpl);
  assert.equal(off.status, 503);
  const bad = await handleReadAloudCheck(req({ text: "blue", audioBase64: audio, mime: "video/x-msvideo" }), await envWithAi(), "u4", json, fetchImpl);
  assert.equal(bad.status, 415);
});
