import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadSettingsPage() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__settingsTest = { state, settingsPage, settingsHeader };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/cai-dat/tich-hop" },
    history: { pushState: () => {}, replaceState: () => {} },
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
  return (context as typeof context & {
    __settingsTest: {
      state: { role: string; route: string; data: Record<string, unknown> };
      settingsPage: () => string;
      settingsHeader: () => string;
    };
  }).__settingsTest;
}

function seed(ui: ReturnType<typeof loadSettingsPage>, integrations?: Record<string, unknown>) {
  ui.state.data = {
    settings: { center: { name: "STEPS", phone: "", email: "", logoUrl: "", address: "" }, branches: [], classTypes: [], tuitionPackages: [], lessonPeriods: [], rooms: [] },
    integrations: integrations ?? {
      sepay: { webhookMode: "HMAC_BODY", webhookSecretHint: "1234" },
      misa: { enabled: true, baseUrl: "https://actapp.misa.vn", clientId: "client-1", clientSecretHint: "5678", taxCode: "0312345678", username: "steps-api", passwordHint: "9012", invSeries: "1C26TYY", invTemplateNo: "01GTKT0/001", taxRateLabel: "KCT" },
      zalo: { enabled: false, appId: "", oaId: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "" },
    },
  };
}

test("tab Tích hợp chỉ hiện với ADMIN, không hiện với ACCOUNTANT", () => {
  const admin = loadSettingsPage();
  admin.state.role = "ADMIN";
  admin.state.route = "/cai-dat/trung-tam";
  seed(admin);
  assert.match(admin.settingsHeader(), /data-nav="\/cai-dat\/tich-hop"/);

  const accountant = loadSettingsPage();
  accountant.state.role = "ACCOUNTANT";
  accountant.state.route = "/cai-dat/tai-khoan";
  seed(accountant);
  assert.doesNotMatch(accountant.settingsHeader(), /data-nav="\/cai-dat\/tich-hop"/);
});

test("ADMIN mở tab Tích hợp thấy ba nhóm cấu hình và ô bí mật chỉ hiện gợi ý mask, không hiện giá trị thật", () => {
  const ui = loadSettingsPage();
  ui.state.role = "ADMIN";
  ui.state.route = "/cai-dat/tich-hop";
  seed(ui);
  const html = ui.settingsPage();

  assert.match(html, /<h2>SePay — Webhook<\/h2>/);
  assert.match(html, /<h2>MISA meInvoice<\/h2>/);
  assert.match(html, /<h2>Zalo OA \/ ZBS<\/h2>/);
  assert.match(html, /id="integration-sepay-form"/);
  assert.match(html, /id="integration-misa-form"/);
  assert.match(html, /id="integration-zalo-form"/);

  assert.match(html, /placeholder="••••1234"/, "ô bí mật SePay chỉ hiện gợi ý 4 ký tự cuối");
  assert.match(html, /placeholder="••••5678"/, "ô bí mật MISA client secret chỉ hiện gợi ý");
  assert.match(html, /placeholder="••••9012"/, "ô mật khẩu MISA chỉ hiện gợi ý");
  assert.match(html, /placeholder="Chưa cấu hình"/, "Zalo chưa cấu hình thì hiện đúng nhãn");

  assert.equal(html.includes('type="password" name="webhookSecret"'), true);
  assert.equal(html.includes('type="password" name="clientSecret"'), true);
  assert.equal(html.includes('type="password" name="appSecret"'), true);
});

test("ACCOUNTANT không render nội dung tab Tích hợp dù bị điều hướng nhầm route", () => {
  const ui = loadSettingsPage();
  ui.state.role = "ACCOUNTANT";
  ui.state.route = "/cai-dat/tich-hop";
  seed(ui);
  const html = ui.settingsPage();
  assert.doesNotMatch(html, /id="integration-sepay-form"/);
});

test("Phase 6: nút Kiểm tra kết nối MISA chỉ bật khi misa.enabled = true", () => {
  const enabledUi = loadSettingsPage();
  enabledUi.state.role = "ADMIN";
  enabledUi.state.route = "/cai-dat/tich-hop";
  seed(enabledUi);
  const enabledHtml = enabledUi.settingsPage();
  assert.match(enabledHtml, /id="integration-misa-ping"(?![^>]*disabled)/);

  const disabledUi = loadSettingsPage();
  disabledUi.state.role = "ADMIN";
  disabledUi.state.route = "/cai-dat/tich-hop";
  seed(disabledUi, {
    sepay: { webhookMode: "API_KEY" },
    misa: { enabled: false, baseUrl: "", clientId: "", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
    zalo: { enabled: false, appId: "", oaId: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "" },
  });
  const disabledHtml = disabledUi.settingsPage();
  assert.match(disabledHtml, /id="integration-misa-ping" disabled/);
});

test("Phase 7: nút Kiểm tra kết nối Zalo chỉ bật khi zalo.enabled = true", () => {
  const enabledUi = loadSettingsPage();
  enabledUi.state.role = "ADMIN";
  enabledUi.state.route = "/cai-dat/tich-hop";
  seed(enabledUi, {
    sepay: { webhookMode: "API_KEY" },
    misa: { enabled: false, baseUrl: "", clientId: "", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
    zalo: { enabled: true, appId: "app-1", oaId: "oa-1", templateIdPaymentRequest: "tpl-1", templateIdInvoiceIssued: "tpl-2" },
  });
  const enabledHtml = enabledUi.settingsPage();
  assert.match(enabledHtml, /id="integration-zalo-ping"(?![^>]*disabled)/);

  const disabledUi = loadSettingsPage();
  disabledUi.state.role = "ADMIN";
  disabledUi.state.route = "/cai-dat/tich-hop";
  seed(disabledUi);
  const disabledHtml = disabledUi.settingsPage();
  assert.match(disabledHtml, /id="integration-zalo-ping" disabled/);
});

test("Nhóm SePay hiện trạng thái webhook gần nhất thay cho nút Kiểm tra kết nối đã tắt cứng", () => {
  const noLogUi = loadSettingsPage();
  noLogUi.state.role = "ADMIN";
  noLogUi.state.route = "/cai-dat/tich-hop";
  seed(noLogUi);
  const noLogHtml = noLogUi.settingsPage();
  assert.doesNotMatch(noLogHtml, /Kiểm tra kết nối<\/button>.*SePay|SePay.*disabled title="Chưa khả dụng"/s);
  assert.match(noLogHtml, /badge-slate" title="[^"]*">Chưa nhận webhook nào<\/span>/);

  const acceptedUi = loadSettingsPage();
  acceptedUi.state.role = "ADMIN";
  acceptedUi.state.route = "/cai-dat/tich-hop";
  seed(acceptedUi);
  acceptedUi.state.data.finance = {
    sepay: {
      webhookLogs: [
        { id: "wh-1", requestId: "req-1", signatureValid: true, processingStatus: "ACCEPTED", providerTransactionId: "TX1", createdAt: "2026-09-22T10:00:00.000Z" },
      ],
    },
  };
  const acceptedHtml = acceptedUi.settingsPage();
  assert.match(acceptedHtml, /badge-green" title="[^"]*">Thành công · [^<]+<\/span>/);

  const rejectedUi = loadSettingsPage();
  rejectedUi.state.role = "ADMIN";
  rejectedUi.state.route = "/cai-dat/tich-hop";
  seed(rejectedUi);
  rejectedUi.state.data.finance = {
    sepay: {
      webhookLogs: [
        { id: "wh-2", requestId: "req-2", signatureValid: false, processingStatus: "REJECTED", createdAt: "2026-09-22T10:05:00.000Z" },
      ],
    },
  };
  const rejectedHtml = rejectedUi.settingsPage();
  assert.match(rejectedHtml, /badge-red" title="[^"]*">Bị từ chối · [^<]+<\/span>/);
});
