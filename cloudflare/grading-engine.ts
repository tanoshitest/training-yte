/**
 * Chấm phiếu bài tập bằng AI: sinh đáp án từ file đề, đọc ảnh bài làm của học viên, nhận ra tên người
 * làm, chấm từng câu và tính điểm. Mọi cuộc gọi mạng đi qua `OpenAiClient` nên test được bằng client giả.
 */
import { extractDocxText } from "./docx-text";
import type { OpenAiClient, OpenAiPart } from "./openai-client";

export interface AnswerKeyQuestion {
  number: number;
  /** Nội dung câu hỏi chép từ đề (để giáo viên đối chiếu khi sửa đáp án). */
  prompt: string;
  /** Mọi đáp án được chấp nhận; chỉ cần học viên viết đúng một trong số này. */
  acceptedAnswers: string[];
  points: number;
}

export interface AnswerKey {
  title: string;
  questions: AnswerKeyQuestion[];
  generatedAt: string;
  /** Có giá trị khi giáo viên đã sửa tay đáp án. */
  editedAt?: string;
}

export interface SubmissionAnswerResult {
  number: number;
  /** Trang (ảnh) chứa câu trả lời, đếm từ 1. */
  page: number;
  studentAnswer: string;
  correct: boolean;
  /** Giải thích tiếng Việt: sai ở đâu, vì sao (rỗng nếu đúng). */
  comment: string;
  /** Câu trả lời của học viên đã được sửa lại cho đúng (rỗng nếu đúng). */
  correction: string;
  /** Giáo viên đã đổi đúng/sai thủ công; AI chấm lại sẽ ghi đè. */
  teacherEdited?: boolean;
}

export interface SubmissionResult {
  /** Tên học viên AI đọc được trên bài (chữ viết tay), rỗng nếu không thấy. */
  detectedName: string;
  answers: SubmissionAnswerResult[];
  /** Số câu đúng. */
  earned: number;
  /** Tổng số câu của đề; điểm = earned/total. */
  total: number;
  /** Góp ý chung cho học viên: điểm tốt, lỗi lặp lại, nên ôn gì. */
  feedback: string;
  note: string;
  gradedAt: string;
  model: string;
}

export interface GradingFileInput {
  name: string;
  mime: string;
  /** Nội dung file mã hoá base64 (không có tiền tố data:). */
  base64: string;
}

const KEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "prompt", "acceptedAnswers"],
        properties: {
          number: { type: "integer" },
          prompt: { type: "string" },
          acceptedAnswers: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["studentName", "note", "feedback", "answers"],
  properties: {
    studentName: { type: "string" },
    note: { type: "string" },
    feedback: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "page", "studentAnswer", "correct", "comment", "correction"],
        properties: {
          number: { type: "integer" },
          page: { type: "integer" },
          studentAnswer: { type: "string" },
          correct: { type: "boolean" },
          comment: { type: "string" },
          correction: { type: "string" },
        },
      },
    },
  },
};

const KEY_INSTRUCTIONS = `Bạn là giáo viên tiếng Anh ra đáp án cho phiếu bài tập của học sinh Việt Nam.
Đọc toàn bộ đề, liệt kê MỌI câu hỏi theo đúng số thứ tự trong đề và giải từng câu.
- number: số thứ tự câu trong đề. prompt: chép lại nguyên văn câu hỏi/câu gốc (kèm chỗ trống nếu có).
- acceptedAnswers: danh sách mọi đáp án đúng chấp nhận được. Với câu điền vào chỗ trống chỉ ghi phần phải điền; với câu viết lại câu, ghi phần học sinh phải viết (không lặp lại phần đề đã in sẵn). Nếu đúng ngữ pháp và giữ nghĩa có nhiều cách viết, ghi tất cả các cách phổ biến. Câu trắc nghiệm ghi đáp án đúng (chữ cái và nội dung).
- title: tiêu đề/yêu cầu chung của đề (một dòng ngắn).
Không bỏ sót câu nào, không bịa thêm câu không có trong đề.`;

const GRADE_INSTRUCTIONS = `Bạn là giáo viên tiếng Anh chấm bài làm viết tay của học sinh Việt Nam từ ảnh chụp.
Bạn được cho đáp án (JSON) và các ảnh bài làm (một bài làm có thể gồm nhiều trang, đánh số trang 1, 2, … theo thứ tự ảnh). Với MỖI câu trong đáp án, đọc chữ học sinh viết ở chỗ trả lời của câu đó rồi chấm:
- correct = true nếu câu trả lời trùng một đáp án chấp nhận, hoặc đúng ngữ pháp và đúng nghĩa tương đương theo yêu cầu đề. Bỏ qua khác biệt hoa/thường, dấu câu cuối câu, khoảng trắng thừa.
- Sai chính tả từ khoá, sai ngữ pháp, sai nghĩa, thiếu/thừa từ làm đổi nghĩa → correct = false.
- Bỏ trống hoặc không đọc được → correct = false, studentAnswer = "", comment giải thích ("Bỏ trống" hoặc "Không đọc được").
- Chữ bị gạch xoá thì coi như không có; lấy chữ học sinh viết cuối cùng.
- studentAnswer: chép đúng điều học sinh viết (không tự sửa lỗi).
- comment: tiếng Việt; câu sai thì chỉ rõ học sinh sai ở đâu và vì sao (từ/cụm nào sai, quy tắc ngữ pháp hay từ vựng liên quan, 1–2 câu dễ hiểu); câu đúng để rỗng.
- correction: câu trả lời của học sinh sau khi sửa cho đúng (giữ nguyên phần đúng, chỉ sửa phần sai, theo đáp án); câu đúng để rỗng; câu bỏ trống thì ghi đáp án đúng.
- page: số trang (ảnh) chứa câu trả lời của câu đó.
studentName: tên học sinh viết trên bài (thường ở đầu trang 1), giữ nguyên cách viết; nếu không có thì "".
note: ghi chú kỹ thuật về ảnh/bài nộp (ví dụ ảnh mờ, thiếu trang), có thể để "".
feedback: góp ý chung cho học sinh bằng tiếng Việt, 3–5 câu, giọng khích lệ: điểm làm tốt, các lỗi lặp lại (gom theo chủ điểm ngữ pháp/từ vựng, nêu số câu liên quan) và nên ôn lại phần nào. Bài đúng hết thì khen và gợi ý nâng cao.
Trả lời đủ MỌI câu trong đáp án, theo thứ tự số câu.`;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export { bytesToBase64 };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Chuyển file đề thành các phần gửi cho model: docx/txt → chữ, pdf và ảnh gửi nguyên. */
export async function examToParts(file: GradingFileInput): Promise<OpenAiPart[]> {
  const lowerName = file.name.toLowerCase();
  const dataUrl = `data:${file.mime};base64,${file.base64}`;
  if (file.mime === DOCX_MIME || lowerName.endsWith(".docx")) {
    const text = await extractDocxText(base64ToBytes(file.base64));
    if (!text.trim()) throw new Error("File Word không có chữ nào để đọc.");
    return [{ type: "text", text: `Nội dung file đề:\n\n${text}` }];
  }
  if (file.mime === "application/pdf" || lowerName.endsWith(".pdf")) return [{ type: "pdf", filename: file.name || "de.pdf", dataUrl }];
  if (file.mime.startsWith("image/")) return [{ type: "image", dataUrl }];
  if (file.mime.startsWith("text/") || lowerName.endsWith(".txt")) {
    return [{ type: "text", text: `Nội dung file đề:\n\n${new TextDecoder().decode(base64ToBytes(file.base64))}` }];
  }
  throw new Error("Chỉ hỗ trợ đề dạng Word (.docx), PDF, ảnh hoặc .txt.");
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Chuẩn hoá đáp án từ AI hoặc từ form sửa tay: bỏ câu trống, số thứ tự duy nhất, điểm hợp lệ. */
export function normalizeAnswerKey(raw: { title?: unknown; questions?: unknown }, generatedAt: string, editedAt?: string): AnswerKey {
  const seen = new Set<number>();
  const questions: AnswerKeyQuestion[] = [];
  for (const item of Array.isArray(raw.questions) ? raw.questions : []) {
    const row = item as Partial<AnswerKeyQuestion>;
    const number = Math.round(Number(row.number));
    if (!Number.isFinite(number) || number < 1 || seen.has(number)) continue;
    seen.add(number);
    questions.push({
      number,
      prompt: cleanText(row.prompt, 600),
      acceptedAnswers: (Array.isArray(row.acceptedAnswers) ? row.acceptedAnswers : []).map((answer) => cleanText(answer)).filter(Boolean).slice(0, 12),
      points: 1,
    });
  }
  questions.sort((a, b) => a.number - b.number);
  return { title: cleanText(raw.title, 200), questions, generatedAt, ...(editedAt ? { editedAt } : {}) };
}

export async function generateAnswerKey(client: OpenAiClient, model: string, exam: GradingFileInput, now = new Date()): Promise<AnswerKey> {
  const parts = await examToParts(exam);
  const raw = await client.generateJson<{ title: string; questions: unknown[] }>({
    model,
    instructions: KEY_INSTRUCTIONS,
    parts: [{ type: "text", text: "Hãy ra đáp án cho đề sau." }, ...parts],
    schemaName: "answer_key",
    schema: KEY_SCHEMA,
  });
  const key = normalizeAnswerKey(raw, now.toISOString());
  if (!key.questions.length) throw new Error("AI không đọc được câu hỏi nào trong đề, kiểm tra lại file đề.");
  return key;
}

/** Tính lại số câu đúng, tổng câu và từ danh sách câu (dùng khi giáo viên sửa tay). */
export function recomputeScore(result: SubmissionResult): SubmissionResult {
  const total = result.answers.length;
  const earned = result.answers.filter((item) => item.correct).length;
  return { ...result, earned, total };
}

/** Điểm = số câu đúng / tổng số câu của đề; câu AI bỏ sót tính là sai để không cộng điểm nhầm. */
export function buildSubmissionResult(
  key: AnswerKey,
  raw: { studentName?: unknown; note?: unknown; feedback?: unknown; answers?: unknown },
  model: string,
  now = new Date(),
  pageCount = 1,
): SubmissionResult {
  const byNumber = new Map<number, Record<string, unknown>>();
  for (const item of Array.isArray(raw.answers) ? raw.answers : []) {
    const row = item as Record<string, unknown>;
    byNumber.set(Math.round(Number(row.number)), row);
  }
  const answers = key.questions.map((question): SubmissionAnswerResult => {
    const row = byNumber.get(question.number);
    if (!row) return { number: question.number, page: 1, studentAnswer: "", correct: false, comment: "AI không đọc được câu này.", correction: "" };
    const correct = row.correct === true;
    return {
      number: question.number,
      page: Math.max(1, Math.min(pageCount, Math.round(Number(row.page)) || 1)),
      studentAnswer: cleanText(row.studentAnswer),
      correct,
      comment: cleanText(row.comment, 400),
      correction: correct ? "" : cleanText(row.correction, 400),
    };
  });
  return recomputeScore({
    detectedName: cleanText(raw.studentName, 80),
    answers,
    earned: 0,
    total: 0,
    feedback: cleanText(raw.feedback, 1200),
    note: cleanText(raw.note, 300),
    gradedAt: now.toISOString(),
    model,
  });
}

/** Chấm một bài làm gồm một hay nhiều ảnh (theo thứ tự trang). */
export async function gradeSubmission(client: OpenAiClient, model: string, key: AnswerKey, pages: GradingFileInput[]): Promise<SubmissionResult> {
  if (!pages.length) throw new Error("Bài làm chưa có ảnh nào.");
  if (pages.some((page) => !page.mime.startsWith("image/"))) throw new Error("Bài làm phải là file ảnh.");
  const keyText = JSON.stringify(key.questions.map(({ number, prompt, acceptedAnswers }) => ({ number, prompt, acceptedAnswers })));
  const parts: OpenAiPart[] = [{ type: "text", text: `Tiêu đề đề bài: ${key.title}
Đáp án:
${keyText}

Bài làm của học sinh gồm ${pages.length} ảnh (trang) theo thứ tự:` }];
  pages.forEach((page, index) => {
    parts.push({ type: "text", text: `Trang ${index + 1}:` }, { type: "image", dataUrl: `data:${page.mime};base64,${page.base64}` });
  });
  const raw = await client.generateJson<{ studentName: string; note: string; feedback: string; answers: unknown[] }>({
    model,
    instructions: GRADE_INSTRUCTIONS,
    parts,
    schemaName: "graded_submission",
    schema: GRADE_SCHEMA,
  });
  return buildSubmissionResult(key, raw, model, new Date(), pages.length);
}

/** Bỏ dấu, hạ chữ thường, chỉ giữ chữ cái → danh sách từ để so tên. */
function nameTokens(value: string): string[] {
  return value
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

export interface RosterStudent { id: string; fullName: string }

/**
 * Khớp tên AI đọc được với danh sách lớp. Trả về học viên khi có đúng một ứng viên vượt trội,
 * ngược lại null (nhiều người cùng tên, hoặc không khớp) để giáo viên chọn tay.
 */
export function matchStudentByName(detectedName: string, roster: RosterStudent[]): string | null {
  const detected = nameTokens(detectedName);
  if (!detected.length) return null;
  const scored = roster.map((student) => {
    const tokens = nameTokens(student.fullName);
    const shared = detected.filter((token) => tokens.includes(token)).length;
    const containment = shared / detected.length;
    const union = new Set([...detected, ...tokens]).size;
    return { id: student.id, score: shared ? 0.7 * containment + 0.3 * (shared / union) : 0 };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 0.65) return null;
  if (second && best.score - second.score < 0.15) return null;
  return best.id;
}
