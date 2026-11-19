import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/recruitment";

export type ConsultationInput = {
  name: string;
  phone: string;
  age: string;
  program: string;
  locale: "vi" | "en";
};

export type ConsultationResult = {
  ok: true;
  code: string;
  alreadySubmitted: boolean;
};

const AGE_LABELS: Record<string, string> = {
  "3-5": "3–5 tuổi",
  "6-11": "6–11 tuổi",
  "12-18": "12–18 tuổi",
  adult: "Người lớn",
};

export class ConsultationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseConsultationInput(body: unknown): ConsultationInput {
  if (!body || typeof body !== "object") {
    throw new ConsultationError(400, "Dữ liệu gửi lên không hợp lệ.");
  }

  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  const age = typeof record.age === "string" ? record.age.trim() : "";
  const program = typeof record.program === "string" ? record.program.trim() : "";
  const locale = record.locale === "en" ? "en" : "vi";

  if (name.length < 2 || name.length > 150) {
    throw new ConsultationError(400, "Họ tên chưa hợp lệ.");
  }
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
    throw new ConsultationError(400, "Số điện thoại chưa hợp lệ.");
  }
  if (!AGE_LABELS[age]) {
    throw new ConsultationError(400, "Độ tuổi chưa hợp lệ.");
  }
  if (!program || program.length > 120) {
    throw new ConsultationError(400, "Chương trình quan tâm chưa hợp lệ.");
  }

  return { name, phone, age, program, locale };
}

export async function createWebsiteConsultation(body: unknown): Promise<ConsultationResult> {
  const input = parseConsultationInput(body);
  const normalizedPhone = normalizePhone(input.phone);
  const ageLabel = AGE_LABELS[input.age];
  const note = `Website${input.locale === "en" ? " EN" : ""} · ${ageLabel} · ${input.program}`;

  const recent = await prisma.recruitmentCase.findFirst({
    where: {
      source: "WEBSITE",
      normalizedPhone,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });
  if (recent) {
    return { ok: true, code: recent.code, alreadySubmitted: true };
  }

  const duplicate = await prisma.recruitmentCase.findFirst({
    where: {
      normalizedPhone,
      fullName: { equals: input.name, mode: "insensitive" },
      stage: { notIn: ["FIRST_MONTH_CARE", "CARE_COMPLETE"] },
    },
    select: { code: true },
  });
  if (duplicate) {
    return { ok: true, code: duplicate.code, alreadySubmitted: true };
  }

  const code = `TS-WEB-${Date.now().toString(36).toUpperCase()}`;
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.recruitmentCase.create({
      data: {
        code,
        fullName: input.name,
        phone: input.phone,
        normalizedPhone,
        schoolGrade: ageLabel,
        learningHistory: note,
        source: "WEBSITE",
        sourceKey: `${normalizedPhone}:${code}`,
        stage: "RECEIVED",
      },
    });
    await tx.recruitmentActivity.create({
      data: {
        caseId: row.id,
        action: "CREATE",
        detail: `Tiếp nhận từ website: ${note}`,
      },
    });
    await tx.recruitmentTask.create({
      data: {
        caseId: row.id,
        kind: "COMPLETE_PROFILE",
        title: "Hoàn thiện thông tin cơ bản",
      },
    });
    return row;
  });

  return { ok: true, code: created.code, alreadySubmitted: false };
}
