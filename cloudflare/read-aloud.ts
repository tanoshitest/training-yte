/**
 * Portal → Đọc sách: học viên đọc to từ vựng / câu mẫu, AI nghe và chấm.
 *
 * Bước 1: OpenAI chuyển giọng đọc thành chữ (không gợi ý câu mẫu để khỏi "sửa hộ" bé).
 * Bước 2: so khớp từng từ với câu mẫu (điểm khách quan), rồi model chat viết nhận xét ngắn,
 *         thân thiện cho trẻ, có thể chỉnh điểm trong biên độ nhỏ khi phát âm gần đúng.
 * Dùng API key AI đã cấu hình ở Cấu hình → AI (chung với chấm Phiếu/Video). Chưa bật → 503.
 */
import { decryptSecret } from "./crypto-secrets";
import { normalizeAiSettings, type IntegrationSettings } from "./integration-settings";
import { createOpenAiClient, OpenAiError } from "./openai-client";

type Kv = { get<T>(key: string, type: "json"): Promise<T | null> };
export interface ReadAloudEnv { STEPS_LMS_DATA: Kv; AUTH_SECRET: string; OPENAI_BASE_URL?: string }
type Json = (body: unknown, status?: number) => Response;

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const DAILY_LIMIT = 300;
const usage = new Map<string, { day: string; count: number }>();

export function normalizeWords(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Điểm khớp từ (0–100) theo dãy con chung dài nhất + danh sách từ mẫu bị thiếu/sai. */
export function scoreReading(target: string, spoken: string) {
  const want = normalizeWords(target);
  const got = normalizeWords(spoken);
  if (!want.length) return { score: 0, missed: [] as string[] };
  const rows = want.length + 1, cols = got.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i]![j] = want[i - 1] === got[j - 1] ? table[i - 1]![j - 1]! + 1 : Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
    }
  }
  const matched = new Set<number>();
  for (let i = want.length, j = got.length; i > 0 && j > 0;) {
    if (want[i - 1] === got[j - 1]) { matched.add(i - 1); i -= 1; j -= 1; }
    else if (table[i - 1]![j]! >= table[i]![j - 1]!) i -= 1;
    else j -= 1;
  }
  const common = matched.size;
  const extra = Math.max(0, got.length - common);
  const raw = common / want.length - Math.min(0.3, extra * 0.05);
  return { score: Math.max(0, Math.min(100, Math.round(raw * 100))), missed: want.filter((_, index) => !matched.has(index)) };
}

export function starsFor(score: number) {
  return score >= 85 ? 3 : score >= 60 ? 2 : score >= 30 ? 1 : 0;
}

function allowUse(key: string) {
  const day = new Date().toISOString().slice(0, 10);
  const row = usage.get(key);
  if (!row || row.day !== day) { usage.set(key, { day, count: 1 }); return true; }
  if (row.count >= DAILY_LIMIT) return false;
  row.count += 1;
  return true;
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a" };

export async function handleReadAloudCheck(request: Request, env: ReadAloudEnv, userKey: string, json: Json, fetchImpl?: typeof fetch) {
  const body = await request.json().catch(() => null) as { text?: unknown; audioBase64?: unknown; mime?: unknown } | null;
  const text = String(body?.text || "").trim().slice(0, 300);
  const base64 = String(body?.audioBase64 || "");
  const mime = String(body?.mime || "audio/webm").split(";")[0]!.trim().toLowerCase();
  if (!text) return json({ error: "Thiếu câu cần đọc." }, 400);
  if (!base64) return json({ error: "Chưa có tiếng đọc — bấm Đọc rồi nói vào micro." }, 400);
  if (base64.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3)) return json({ error: "Bản ghi quá dài, đọc ngắn lại nhé." }, 413);
  if (!EXT[mime]) return json({ error: "Định dạng ghi âm chưa hỗ trợ." }, 415);
  const stored = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
  const ai = normalizeAiSettings(stored?.ai);
  const apiKey = ai.apiKeyEncrypted ? await decryptSecret(ai.apiKeyEncrypted, env.AUTH_SECRET).catch(() => "") : "";
  if (!ai.enabled || !apiKey) return json({ error: "AI chấm đọc chưa được bật (Cấu hình → AI)." }, 503);
  if (!allowUse(userKey)) return json({ error: "Hôm nay em đã luyện đọc rất nhiều rồi, mai luyện tiếp nhé!" }, 429);

  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64.replace(/^data:[^,]+,/, "")), (char) => char.charCodeAt(0)); } catch { return json({ error: "Bản ghi lỗi, đọc lại nhé." }, 400); }
  if (bytes.length < 800) return json({ error: "Chưa nghe thấy gì — em đọc to hơn nhé." }, 400);
  const client = createOpenAiClient({ apiKey, baseUrl: env.OPENAI_BASE_URL, fetchImpl, timeoutMs: 60_000 });
  const audio = new Blob([bytes], { type: mime });
  let transcript = "";
  try {
    try {
      transcript = await client.transcribe({ model: "gpt-4o-mini-transcribe", audio, filename: `doc.${EXT[mime]}`, language: "en" });
    } catch (error) {
      if (!(error instanceof OpenAiError) || ![400, 404].includes(error.status)) throw error;
      transcript = await client.transcribe({ model: "whisper-1", audio, filename: `doc.${EXT[mime]}`, language: "en" });
    }
  } catch (error) {
    return json({ error: error instanceof OpenAiError ? error.message : "Không nghe được bản ghi, thử lại." }, 502);
  }

  const base = scoreReading(text, transcript);
  let score = base.score;
  let feedback = "";
  let practice = base.missed.slice(0, 5);
  try {
    const result = await client.generateJson<{ score: number; feedback: string; practice_words: string[] }>({
      model: ai.model || "gpt-4.1-mini",
      instructions: "Bạn là cô giáo tiếng Anh thân thiện chấm bài đọc to của học sinh tiểu học Việt Nam. Viết nhận xét bằng tiếng Việt, 1–2 câu ngắn, khen trước rồi góp ý cụ thể (từ nào đọc thiếu/sai), giọng vui vẻ, gọi học sinh là 'em'. Điểm 0–100: dựa trên điểm khớp từ đã tính sẵn, chỉ chỉnh tối đa ±10 nếu bản nghe có dấu hiệu nhận dạng sai do phát âm gần đúng. Nếu bản nghe rỗng hoặc không liên quan thì điểm thấp.",
      parts: [{ type: "text", text: `Câu mẫu: "${text}"\nMáy nghe được em đọc: "${transcript}"\nĐiểm khớp từ: ${base.score}/100\nTừ mẫu chưa khớp: ${base.missed.join(", ") || "(không có)"}` }],
      schemaName: "read_aloud_feedback",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["score", "feedback", "practice_words"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          feedback: { type: "string" },
          practice_words: { type: "array", items: { type: "string" }, maxItems: 5 },
        },
      },
      maxOutputTokens: 400,
    });
    if (Number.isFinite(result.score)) score = Math.max(0, Math.min(100, Math.max(base.score - 10, Math.min(base.score + 10, Math.round(result.score)))));
    feedback = String(result.feedback || "").slice(0, 400);
    if (Array.isArray(result.practice_words)) practice = result.practice_words.map(String).slice(0, 5);
  } catch {
    feedback = "";
  }
  if (!feedback) {
    feedback = score >= 85 ? "Tuyệt vời! Em đọc rất rõ và đúng." : score >= 60 ? `Em đọc khá tốt! Luyện thêm: ${practice.join(", ") || "đọc chậm, rõ từng từ"}.` : "Em nghe lại câu mẫu rồi đọc chậm, rõ từng từ nhé!";
  }
  return json({ ok: true, transcript, score, stars: starsFor(score), feedback, practiceWords: practice });
}
