import { encryptSecret, secretHint } from "./crypto-secrets";
import { normalizeMisaInvoiceFields, type MisaInvoiceFields } from "./misa-invoice-fields";

export interface IntegrationSettings {
  sepay: {
    webhookMode: "HMAC_BODY" | "HMAC_TIMESTAMP_BODY" | "API_KEY" | "DISABLED";
    /** Ciphertext, không bao giờ trả về client dạng rõ. */
    webhookSecretEncrypted?: string;
    /** 4 ký tự cuối, để UI hiện "••••1234". */
    webhookSecretHint?: string;
  };
  misa: {
    enabled: boolean;
    /** Công tắc riêng cho nút "Xuất hóa đơn"/"Phát hành lại" ở trang quản lý hóa đơn — tắt trong lúc dev để không lỡ tay phát hành hóa đơn thật, độc lập với `enabled` (dùng để bật/tắt bộ thử nghiệm sandbox). */
    issueEnabled: boolean;
    baseUrl: string;
    clientId: string;
    clientSecretEncrypted?: string;
    clientSecretHint?: string;
    taxCode: string;
    username: string;
    passwordEncrypted?: string;
    passwordHint?: string;
    invSeries: string;
    invTemplateNo: string;
    taxRateLabel: string;
    /** Thông số hóa đơn admin tự chỉnh ở UI; bản lưu cũ có thể thiếu khối này — đọc qua `normalizeMisaInvoiceFields`. */
    invoiceFields: MisaInvoiceFields;
  };
  zalo: {
    enabled: boolean;
    appId: string;
    appSecretEncrypted?: string;
    appSecretHint?: string;
    oaId: string;
    refreshTokenEncrypted?: string;
    refreshTokenHint?: string;
    templateIdPaymentRequest: string;
    templateIdInvoiceIssued: string;
  };
  /** Chấm bài tự động bằng OpenAI. Bản lưu cũ chưa có khối này — đọc qua `normalizeAiSettings`. */
  ai: {
    enabled: boolean;
    apiKeyEncrypted?: string;
    apiKeyHint?: string;
    /** Model OpenAI dùng để sinh đáp án và chấm bài, chọn từ danh sách model mới. */
    model: string;
  };
  updatedAt: string;
  updatedBy: string;
}

export function normalizeAiSettings(ai?: Partial<IntegrationSettings["ai"]>): IntegrationSettings["ai"] {
  return { enabled: Boolean(ai?.enabled), apiKeyEncrypted: ai?.apiKeyEncrypted, apiKeyHint: ai?.apiKeyHint, model: text(ai?.model) };
}

export function defaultIntegrationSettings(): IntegrationSettings {
  return {
    // SePay của trung tâm xác thực webhook bằng API Key (header "Authorization: Apikey
    // <token>"), không dùng chữ ký HMAC — xác nhận trực tiếp với trung tâm (Q2).
    sepay: { webhookMode: "API_KEY" },
    misa: {
      enabled: false, issueEnabled: false, baseUrl: "", clientId: "", taxCode: "", username: "",
      invSeries: "", invTemplateNo: "", taxRateLabel: "", invoiceFields: normalizeMisaInvoiceFields(),
    },
    zalo: {
      enabled: false, appId: "", oaId: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "",
    },
    ai: { enabled: false, model: "" },
    updatedAt: "",
    updatedBy: "",
  };
}

/** Dữ liệu client gửi lên khi lưu: bí mật ở dạng rõ, rỗng nghĩa là giữ nguyên giá trị cũ. */
export interface IntegrationSettingsPatch {
  sepay: {
    webhookMode: IntegrationSettings["sepay"]["webhookMode"];
    webhookSecret?: string;
  };
  misa: {
    enabled: boolean;
    issueEnabled: boolean;
    baseUrl: string;
    clientId: string;
    clientSecret?: string;
    taxCode: string;
    username: string;
    password?: string;
    invSeries: string;
    invTemplateNo: string;
    taxRateLabel: string;
    /** Bỏ trống (client cũ) thì giữ nguyên thông số hóa đơn đang lưu. */
    invoiceFields?: Partial<MisaInvoiceFields>;
  };
  zalo: {
    enabled: boolean;
    appId: string;
    appSecret?: string;
    oaId: string;
    refreshToken?: string;
    templateIdPaymentRequest: string;
    templateIdInvoiceIssued: string;
  };
  /** Bỏ trống (client cũ) thì giữ nguyên cấu hình chấm bài AI đang lưu. */
  ai?: {
    enabled: boolean;
    apiKey?: string;
    model: string;
  };
}

/** Dạng duy nhất được trả về client: bỏ hẳn mọi field `*Encrypted`, giữ `*Hint`. */
export type MaskedIntegrationSettings = {
  sepay: Omit<IntegrationSettings["sepay"], "webhookSecretEncrypted">;
  misa: Omit<IntegrationSettings["misa"], "clientSecretEncrypted" | "passwordEncrypted">;
  zalo: Omit<IntegrationSettings["zalo"], "appSecretEncrypted" | "refreshTokenEncrypted">;
  ai: Omit<IntegrationSettings["ai"], "apiKeyEncrypted">;
  updatedAt: string;
  updatedBy: string;
};

export function maskIntegrationSettings(settings: IntegrationSettings): MaskedIntegrationSettings {
  return {
    sepay: { webhookMode: settings.sepay.webhookMode, webhookSecretHint: settings.sepay.webhookSecretHint },
    misa: {
      enabled: settings.misa.enabled, issueEnabled: settings.misa.issueEnabled, baseUrl: settings.misa.baseUrl, clientId: settings.misa.clientId,
      clientSecretHint: settings.misa.clientSecretHint, taxCode: settings.misa.taxCode, username: settings.misa.username,
      passwordHint: settings.misa.passwordHint, invSeries: settings.misa.invSeries,
      invTemplateNo: settings.misa.invTemplateNo, taxRateLabel: settings.misa.taxRateLabel,
      invoiceFields: normalizeMisaInvoiceFields(settings.misa.invoiceFields),
    },
    zalo: {
      enabled: settings.zalo.enabled, appId: settings.zalo.appId, appSecretHint: settings.zalo.appSecretHint,
      oaId: settings.zalo.oaId, refreshTokenHint: settings.zalo.refreshTokenHint,
      templateIdPaymentRequest: settings.zalo.templateIdPaymentRequest, templateIdInvoiceIssued: settings.zalo.templateIdInvoiceIssued,
    },
    ai: { enabled: normalizeAiSettings(settings.ai).enabled, apiKeyHint: settings.ai?.apiKeyHint, model: normalizeAiSettings(settings.ai).model },
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function resolveSecret(
  newValue: string | undefined,
  previous: { encrypted?: string; hint?: string },
  masterKey: string,
): Promise<{ encrypted?: string; hint?: string }> {
  const trimmed = (newValue ?? "").trim();
  // Chuỗi rỗng, không gửi, hoặc chuỗi mask "••••1234" gửi nhầm lên → giữ nguyên bí mật cũ.
  if (!trimmed || trimmed.startsWith("•")) return previous;
  return { encrypted: await encryptSecret(trimmed, masterKey), hint: secretHint(trimmed) };
}

/** Gộp patch từ client vào cấu hình hiện có, mã hoá bí mật mới bằng `masterKey`. */
export async function mergeIntegrationSettings(
  current: IntegrationSettings,
  patch: IntegrationSettingsPatch,
  masterKey: string,
  updatedBy: string,
): Promise<IntegrationSettings> {
  const sepaySecret = await resolveSecret(patch.sepay.webhookSecret, { encrypted: current.sepay.webhookSecretEncrypted, hint: current.sepay.webhookSecretHint }, masterKey);
  const misaClientSecret = await resolveSecret(patch.misa.clientSecret, { encrypted: current.misa.clientSecretEncrypted, hint: current.misa.clientSecretHint }, masterKey);
  const misaPassword = await resolveSecret(patch.misa.password, { encrypted: current.misa.passwordEncrypted, hint: current.misa.passwordHint }, masterKey);
  const zaloAppSecret = await resolveSecret(patch.zalo.appSecret, { encrypted: current.zalo.appSecretEncrypted, hint: current.zalo.appSecretHint }, masterKey);
  const zaloRefreshToken = await resolveSecret(patch.zalo.refreshToken, { encrypted: current.zalo.refreshTokenEncrypted, hint: current.zalo.refreshTokenHint }, masterKey);
  const currentAi = normalizeAiSettings(current.ai);
  const aiKey = await resolveSecret(patch.ai?.apiKey, { encrypted: currentAi.apiKeyEncrypted, hint: currentAi.apiKeyHint }, masterKey);
  const ai = patch.ai
    ? { enabled: Boolean(patch.ai.enabled), apiKeyEncrypted: aiKey.encrypted, apiKeyHint: aiKey.hint, model: text(patch.ai.model).trim().slice(0, 100) }
    : currentAi;

  return {
    sepay: { webhookMode: patch.sepay.webhookMode, webhookSecretEncrypted: sepaySecret.encrypted, webhookSecretHint: sepaySecret.hint },
    misa: {
      enabled: Boolean(patch.misa.enabled), issueEnabled: Boolean(patch.misa.issueEnabled), baseUrl: text(patch.misa.baseUrl), clientId: text(patch.misa.clientId),
      clientSecretEncrypted: misaClientSecret.encrypted, clientSecretHint: misaClientSecret.hint,
      taxCode: text(patch.misa.taxCode), username: text(patch.misa.username),
      passwordEncrypted: misaPassword.encrypted, passwordHint: misaPassword.hint,
      invSeries: text(patch.misa.invSeries), invTemplateNo: text(patch.misa.invTemplateNo), taxRateLabel: text(patch.misa.taxRateLabel),
      invoiceFields: normalizeMisaInvoiceFields({ ...normalizeMisaInvoiceFields(current.misa.invoiceFields), ...(patch.misa.invoiceFields || {}) }),
    },
    zalo: {
      enabled: Boolean(patch.zalo.enabled), appId: text(patch.zalo.appId),
      appSecretEncrypted: zaloAppSecret.encrypted, appSecretHint: zaloAppSecret.hint,
      oaId: text(patch.zalo.oaId), refreshTokenEncrypted: zaloRefreshToken.encrypted, refreshTokenHint: zaloRefreshToken.hint,
      templateIdPaymentRequest: text(patch.zalo.templateIdPaymentRequest), templateIdInvoiceIssued: text(patch.zalo.templateIdInvoiceIssued),
    },
    ai,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}
