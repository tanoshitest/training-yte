import assert from "node:assert/strict";
import test from "node:test";

import { decryptSecret, encryptSecret, secretHint } from "../cloudflare/crypto-secrets";
import {
  defaultIntegrationSettings,
  maskIntegrationSettings,
  mergeIntegrationSettings,
  type IntegrationSettings,
  type IntegrationSettingsPatch,
} from "../cloudflare/integration-settings";

const MASTER_KEY = "test-auth-secret-at-least-32-characters-long";

test("cấu hình mặc định (chưa ai lưu gì) dùng API_KEY cho webhook SePay (Q2 đã chốt)", () => {
  assert.equal(defaultIntegrationSettings().sepay.webhookMode, "API_KEY", "SePay của trung tâm xác thực webhook bằng token, không dùng HMAC");
});

test("decryptSecret(encryptSecret(x)) trả đúng chuỗi gốc", async () => {
  const ciphertext = await encryptSecret("whsec-real-value", MASTER_KEY);
  assert.notEqual(ciphertext, "whsec-real-value");
  assert.equal(await decryptSecret(ciphertext, MASTER_KEY), "whsec-real-value");
});

test("ciphertext hỏng hoặc sai khoá không throw, trả chuỗi rỗng", async () => {
  assert.equal(await decryptSecret("garbage-not-ciphertext", MASTER_KEY), "");
  assert.equal(await decryptSecret("v1.only-two-parts", MASTER_KEY), "");
  const real = await encryptSecret("secret-value", MASTER_KEY);
  assert.equal(await decryptSecret(real, "a-completely-different-master-key-32+chars"), "");
});

test("secretHint lấy đúng 4 ký tự cuối", () => {
  assert.equal(secretHint("whsec-abcd1234"), "1234");
});

function patch(overrides: Partial<IntegrationSettingsPatch> = {}): IntegrationSettingsPatch {
  return {
    sepay: { webhookMode: "HMAC_BODY" },
    misa: { enabled: false, baseUrl: "", clientId: "", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
    zalo: { enabled: false, appId: "", oaId: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "" },
    ...overrides,
  };
}

test("maskIntegrationSettings bỏ hẳn mọi field *Encrypted, giữ *Hint", async () => {
  const settings: IntegrationSettings = await mergeIntegrationSettings(
    defaultIntegrationSettings(),
    patch({ sepay: { webhookMode: "HMAC_BODY", webhookSecret: "whsec-real" } }),
    MASTER_KEY,
    "admin@steps.vn",
  );
  const masked = maskIntegrationSettings(settings);
  assert.equal(JSON.stringify(masked).includes("Encrypted"), false, "response không được chứa key *Encrypted");
  assert.equal(JSON.stringify(masked).includes("whsec-real"), false, "response không được chứa giá trị bí mật gốc");
  assert.equal(masked.sepay.webhookSecretHint, "real");
});

test("lưu lại với ô bí mật để trống không xoá mất giá trị đã lưu trước đó", async () => {
  const first = await mergeIntegrationSettings(
    defaultIntegrationSettings(),
    patch({ sepay: { webhookMode: "HMAC_BODY", webhookSecret: "whsec-lan-1" } }),
    MASTER_KEY,
    "admin@steps.vn",
  );
  assert.equal(await decryptSecret(first.sepay.webhookSecretEncrypted!, MASTER_KEY), "whsec-lan-1");

  const second = await mergeIntegrationSettings(
    first,
    patch({ sepay: { webhookMode: "HMAC_TIMESTAMP_BODY" } }),
    MASTER_KEY,
    "admin@steps.vn",
  );
  assert.equal(second.sepay.webhookMode, "HMAC_TIMESTAMP_BODY", "field không phải bí mật vẫn cập nhật bình thường");
  assert.equal(await decryptSecret(second.sepay.webhookSecretEncrypted!, MASTER_KEY), "whsec-lan-1", "bí mật cũ phải còn nguyên vì patch lần 2 để trống");
});

test("chuỗi bắt đầu bằng • gửi nhầm lên bị coi như giữ nguyên, không ghi đè bằng mask", async () => {
  const first = await mergeIntegrationSettings(
    defaultIntegrationSettings(),
    patch({ misa: { enabled: true, baseUrl: "https://actapp.misa.vn", clientId: "client-1", clientSecret: "misa-secret-1", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" } }),
    MASTER_KEY,
    "admin@steps.vn",
  );
  const second = await mergeIntegrationSettings(
    first,
    patch({ misa: { enabled: true, baseUrl: "https://actapp.misa.vn", clientId: "client-1", clientSecret: "••••cret-1", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" } }),
    MASTER_KEY,
    "admin@steps.vn",
  );
  assert.equal(await decryptSecret(second.misa.clientSecretEncrypted!, MASTER_KEY), "misa-secret-1");
});
