/**
 * Client OpenAI tối thiểu cho chấm bài: liệt kê model và gọi Responses API với đầu ra JSON theo schema.
 * Không dùng SDK để chạy được cả trên Node (VPS) lẫn Workers. API key chỉ đi trong header, không bao giờ
 * đưa vào thông báo lỗi hay log.
 */

export type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string }
  | { type: "pdf"; filename: string; dataUrl: string };

export interface OpenAiModel {
  id: string;
  /** Unix giây — thời điểm OpenAI phát hành model. */
  created: number;
}

export interface OpenAiClientConfig {
  apiKey: string;
  /** Mặc định https://api.openai.com/v1; chỉ đổi khi chạy thử với máy chủ giả. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "OpenAiError";
  }
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Model dùng được để chấm bài (chat + đọc ảnh): họ gpt-N / oN / chatgpt-, bỏ audio, ảnh, embedding… */
const CHAT_MODEL_PATTERN = /^(gpt-\d|o\d|chatgpt-)/;
const NON_GRADING_PATTERN = /(audio|realtime|transcribe|tts|image|embedding|moderation|search|whisper|dall|instruct|codex|deep-research|computer-use|diarize)/;

/** Chỉ giữ model phát hành trong `months` tháng gần nhất, mới nhất lên đầu. */
export function pickRecentGradingModels(models: OpenAiModel[], now = new Date(), months = 6): OpenAiModel[] {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const cutoffSeconds = Math.floor(cutoff.getTime() / 1000);
  return models
    .filter((model) => CHAT_MODEL_PATTERN.test(model.id) && !NON_GRADING_PATTERN.test(model.id) && model.created >= cutoffSeconds)
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
}

function explainStatus(status: number, apiMessage: string): string {
  if (status === 401) return "API key không hợp lệ hoặc đã bị thu hồi.";
  if (status === 403) return "API key không có quyền dùng model/chức năng này.";
  if (status === 404) return `Model không tồn tại hoặc tài khoản chưa được dùng.${apiMessage ? ` (${apiMessage})` : ""}`;
  if (status === 429) return "OpenAI báo hết hạn mức hoặc gọi quá nhanh, thử lại sau ít phút.";
  if (status >= 500) return "OpenAI đang lỗi, thử lại sau.";
  return apiMessage || `OpenAI trả lỗi ${status}.`;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return String(body?.error?.message ?? "").slice(0, 300);
  } catch {
    return "";
  }
}

export function createOpenAiClient(config: OpenAiClientConfig) {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 120_000;

  async function call(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.headers || {}) },
        signal: controller.signal,
      });
      if (!response.ok) throw new OpenAiError(explainStatus(response.status, await readApiError(response)), response.status);
      return response;
    } catch (error) {
      if (error instanceof OpenAiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new OpenAiError("OpenAI phản hồi quá lâu, thử lại.");
      throw new OpenAiError("Không kết nối được tới OpenAI.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async listModels(): Promise<OpenAiModel[]> {
      const response = await call("/models", { method: "GET" });
      const body = (await response.json()) as { data?: { id?: unknown; created?: unknown }[] };
      return (body.data ?? [])
        .map((row) => ({ id: String(row.id ?? ""), created: Number(row.created) || 0 }))
        .filter((row) => row.id);
    },

    /** Chuyển giọng nói thành chữ (POST /audio/transcriptions). */
    async transcribe(input: { model: string; audio: Blob; filename: string; language?: string }): Promise<string> {
      const form = new FormData();
      form.append("model", input.model);
      form.append("file", input.audio, input.filename);
      if (input.language) form.append("language", input.language);
      form.append("response_format", "json");
      const response = await call("/audio/transcriptions", { method: "POST", body: form });
      const body = (await response.json()) as { text?: string };
      return String(body.text ?? "").trim();
    },

    /** Gọi model, ép trả JSON đúng `schema`; trả về object đã parse. */
    async generateJson<T>(input: {
      model: string;
      instructions: string;
      parts: OpenAiPart[];
      schemaName: string;
      schema: Record<string, unknown>;
      maxOutputTokens?: number;
    }): Promise<T> {
      const content = input.parts.map((part) => {
        if (part.type === "text") return { type: "input_text", text: part.text };
        if (part.type === "image") return { type: "input_image", image_url: part.dataUrl, detail: "high" };
        return { type: "input_file", filename: part.filename, file_data: part.dataUrl };
      });
      const response = await call("/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          instructions: input.instructions,
          input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
          max_output_tokens: input.maxOutputTokens ?? 16_000,
          store: false,
        }),
      });
      const body = (await response.json()) as {
        status?: string;
        incomplete_details?: { reason?: string };
        output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
      };
      const parts = (body.output ?? []).flatMap((item) => item.content ?? []);
      const refusal = parts.find((part) => part.type === "refusal");
      if (refusal) throw new OpenAiError("Model từ chối xử lý nội dung này.");
      const text = parts.find((part) => part.type === "output_text")?.text;
      if (!text) {
        throw new OpenAiError(body.status === "incomplete" ? "Kết quả bị cắt giữa chừng (quá dài), thử model khác." : "OpenAI không trả kết quả.");
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new OpenAiError("Kết quả AI không đúng định dạng, thử lại.");
      }
    },
  };
}

export type OpenAiClient = ReturnType<typeof createOpenAiClient>;
