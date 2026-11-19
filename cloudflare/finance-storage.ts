/**
 * Đọc/ghi khối tài chính và cấu hình tích hợp — tách khỏi `worker.ts` để
 * `invoice-outbox.ts` (Phase 6) và `zalo-outbox.ts` (Phase 7) dùng chung mà không tạo
 * vòng import ngược lại `worker.ts`.
 */
import { defaultIntegrationSettings, type IntegrationSettings } from "./integration-settings";
import { normalizeMisaInvoiceFields } from "./misa-invoice-fields";
import { decryptSecret, encryptSecret, secretHint } from "./crypto-secrets";
import { hydrateFinance, type DemoFinance } from "./finance-types";
import type { ZaloMessageLog } from "./storage/zalo-message-repository";

export interface FinanceKvEnv {
  STEPS_LMS_DATA: {
    get<T>(key: string, type: "json"): Promise<T | null>;
    put(key: string, value: string): Promise<void>;
    /** VPS PostgreSQL adapter: compare-and-swap nguyên tử, tránh hai request ghi đè nhau. */
    compareAndPut?(key: string, expected: string, value: string): Promise<boolean>;
  };
  AUTH_SECRET: string;
  SEPAY_WEBHOOK_SECRET?: string;
  PUBLIC_BASE_URL?: string;
}

export async function readFinanceSnapshot(env: FinanceKvEnv) {
  const stored = await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json");
  return { stored: JSON.stringify(stored ?? null), finance: hydrateFinance(stored) };
}

/**
 * Tài chính nằm trong một khối JSON duy nhất, nên hai request chạy chồng nhau sẽ
 * ghi đè phiếu của nhau. Chỉ ghi khi kho vẫn đúng bản đã đọc; lệch thì trả về false
 * để chỗ gọi đọc lại và làm lại, tránh mất biên lai đã thu.
 */
export async function persistFinanceIfUnchanged(env: FinanceKvEnv, expected: string, finance: DemoFinance) {
  const serialized = JSON.stringify(finance);
  if (env.STEPS_LMS_DATA.compareAndPut) {
    return env.STEPS_LMS_DATA.compareAndPut("finance:steps-demo", expected, serialized);
  }
  const current = await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json");
  if (JSON.stringify(current ?? null) !== expected) return false;
  await env.STEPS_LMS_DATA.put("finance:steps-demo", serialized);
  return true;
}

/**
 * Cấu hình hiệu lực của ba tích hợp, bí mật đã giải mã. Dùng chung cho Phase 1, 6, 7
 * (DRY) thay vì mỗi chỗ tự đọc khối `integrations:steps-demo` và tự giải mã.
 *
 * Bí mật webhook SePay ưu tiên khối cấu hình UI; `env.SEPAY_WEBHOOK_SECRET` chỉ còn là
 * đường lùi cho tới khi gỡ khỏi `vps-server.ts` ở Phase 8.
 */
export async function readEffectiveIntegrationSettings(env: FinanceKvEnv) {
  const stored = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
  const settings = stored ?? defaultIntegrationSettings();
  const decrypt = (ciphertext: string | undefined) => ciphertext ? decryptSecret(ciphertext, env.AUTH_SECRET) : Promise.resolve("");
  const [sepaySecret, misaClientSecret, misaPassword, zaloAppSecret, zaloRefreshToken] = await Promise.all([
    decrypt(settings.sepay.webhookSecretEncrypted),
    decrypt(settings.misa.clientSecretEncrypted),
    decrypt(settings.misa.passwordEncrypted),
    decrypt(settings.zalo.appSecretEncrypted),
    decrypt(settings.zalo.refreshTokenEncrypted),
  ]);
  return {
    sepay: { mode: settings.sepay.webhookMode, secret: sepaySecret || env.SEPAY_WEBHOOK_SECRET || "" },
    misa: {
      enabled: settings.misa.enabled, issueEnabled: settings.misa.issueEnabled, baseUrl: settings.misa.baseUrl, clientId: settings.misa.clientId,
      clientSecret: misaClientSecret, taxCode: settings.misa.taxCode, username: settings.misa.username,
      password: misaPassword, invSeries: settings.misa.invSeries, invTemplateNo: settings.misa.invTemplateNo,
      taxRateLabel: settings.misa.taxRateLabel,
      invoiceFields: normalizeMisaInvoiceFields(settings.misa.invoiceFields),
    },
    zalo: {
      enabled: settings.zalo.enabled, appId: settings.zalo.appId, appSecret: zaloAppSecret,
      oaId: settings.zalo.oaId, refreshToken: zaloRefreshToken,
      templateIdPaymentRequest: settings.zalo.templateIdPaymentRequest, templateIdInvoiceIssued: settings.zalo.templateIdInvoiceIssued,
    },
  };
}

export async function readZaloMessageLogs(env: FinanceKvEnv): Promise<{ stored: string; logs: ZaloMessageLog[] }> {
  const stored = await env.STEPS_LMS_DATA.get<ZaloMessageLog[]>("zalo-messages:steps-demo", "json");
  return { stored: JSON.stringify(stored ?? null), logs: Array.isArray(stored) ? stored : [] };
}

/** Cùng ngữ nghĩa compare-and-swap với `persistFinanceIfUnchanged`, áp cho khối log tin Zalo riêng. */
export async function persistZaloMessageLogsIfUnchanged(env: FinanceKvEnv, expected: string, logs: ZaloMessageLog[]): Promise<boolean> {
  const serialized = JSON.stringify(logs);
  if (env.STEPS_LMS_DATA.compareAndPut) {
    return env.STEPS_LMS_DATA.compareAndPut("zalo-messages:steps-demo", expected, serialized);
  }
  const current = await env.STEPS_LMS_DATA.get<ZaloMessageLog[]>("zalo-messages:steps-demo", "json");
  if (JSON.stringify(current ?? null) !== expected) return false;
  await env.STEPS_LMS_DATA.put("zalo-messages:steps-demo", serialized);
  return true;
}

/**
 * Ghi lại refresh token Zalo xoay vòng vào khối cấu hình tích hợp — một `compareAndPut`
 * ngắn, tách khỏi cửa sổ ghi khối tài chính (R1). Tự đọc lại và làm lại khi xung đột.
 */
export async function rotateZaloRefreshToken(env: FinanceKvEnv, nextRefreshToken: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
    const current = stored ?? defaultIntegrationSettings();
    const expected = JSON.stringify(stored ?? null);
    const next: IntegrationSettings = {
      ...current,
      zalo: { ...current.zalo, refreshTokenEncrypted: await encryptSecret(nextRefreshToken, env.AUTH_SECRET), refreshTokenHint: secretHint(nextRefreshToken) },
    };
    const serialized = JSON.stringify(next);
    const ok = env.STEPS_LMS_DATA.compareAndPut
      ? await env.STEPS_LMS_DATA.compareAndPut("integrations:steps-demo", expected, serialized)
      : await (async () => {
        const latest = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
        if (JSON.stringify(latest ?? null) !== expected) return false;
        await env.STEPS_LMS_DATA.put("integrations:steps-demo", serialized);
        return true;
      })();
    if (ok) return;
  }
}
