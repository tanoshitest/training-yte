import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MISA_INVOICE_FIELDS, MISA_ANONYMOUS_BUYER_NAME, normalizeMisaInvoiceFields, renderMisaItemName, resolveMisaBuyer, resolveMisaBuyerName,
} from "../cloudflare/misa-invoice-fields";
import { mergeIntegrationSettings, defaultIntegrationSettings, maskIntegrationSettings, type IntegrationSettingsPatch } from "../cloudflare/integration-settings";
import { buildMisaInvoiceData } from "../cloudflare/misa-invoice-payload";

test("normalize: thiếu, rỗng hoặc sai kiểu thì dùng mặc định; nguồn tên lạ về PARENT", () => {
  assert.deepEqual(normalizeMisaInvoiceFields(undefined), DEFAULT_MISA_INVOICE_FIELDS);
  assert.deepEqual(normalizeMisaInvoiceFields({ itemNameTemplate: "   ", unitNameCourse: "", buyerNameSource: "X" as never }), DEFAULT_MISA_INVOICE_FIELDS);
  const custom = normalizeMisaInvoiceFields({ itemNameTemplate: " Phí {period} ", buyerNameSource: "STUDENT" });
  assert.equal(custom.itemNameTemplate, "Phí {period}");
  assert.equal(custom.buyerNameSource, "STUDENT");
});

test("renderMisaItemName thay biến, bỏ biến lạ, gọn khoảng trắng, rỗng thì về Học phí", () => {
  assert.equal(renderMisaItemName("Học phí {period} - {studentName}", { period: "Tháng 9/2026", studentName: "An" }), "Học phí Tháng 9/2026 - An");
  assert.equal(renderMisaItemName("Học phí {period}", { period: "" }), "Học phí");
  assert.equal(renderMisaItemName("Phí {khongCo} lớp {className}", { className: "A1" }), "Phí lớp A1");
  assert.equal(renderMisaItemName("{period}", {}), "Học phí");
});

test("resolveMisaBuyerName: chỉ thay tên học viên gốc bằng tên phụ huynh", () => {
  const base = { parentName: "Bà Lan", studentNames: ["Nguyễn Văn A", ""] };
  assert.equal(resolveMisaBuyerName({ ...base, source: "PARENT", invoiceBuyerName: "nguyễn văn a" }), "Bà Lan");
  assert.equal(resolveMisaBuyerName({ ...base, source: "PARENT", invoiceBuyerName: "Công ty ABC" }), "Công ty ABC");
  assert.equal(resolveMisaBuyerName({ ...base, source: "STUDENT", invoiceBuyerName: "Nguyễn Văn A" }), "Nguyễn Văn A");
  assert.equal(resolveMisaBuyerName({ ...base, parentName: " ", source: "PARENT", invoiceBuyerName: "Nguyễn Văn A" }), "Nguyễn Văn A");
});

test("payload: hình thức thanh toán tùy chỉnh; có email thì MISA tự gửi tới đúng email đó", () => {
  const draft = { refId: "r", invSeries: "1C26TYY", taxRateLabel: "KCT", itemName: "x", amount: 1000, paymentMethodName: "Chuyển khoản" };
  const withEmail = buildMisaInvoiceData({ ...draft, buyer: { fullName: "A", email: "a@example.com" } });
  const withoutEmail = buildMisaInvoiceData({ ...draft, buyer: { fullName: "A" } });
  assert.ok(withEmail.ok && withoutEmail.ok);
  if (withEmail.ok && withoutEmail.ok) {
    assert.equal(withEmail.data.PaymentMethodName, "Chuyển khoản");
    assert.equal(withEmail.data.IsSendEmail, true);
    assert.equal(withEmail.data.ReceiverEmail, "a@example.com");
    assert.equal(withoutEmail.data.IsSendEmail, false);
  }
});

test("resolveMisaBuyer: đủ tên phụ huynh + địa chỉ + CCCD thì mẫu có thông tin, thiếu một thứ thì mẫu không thông tin", () => {
  const student = { parentName: "Lê Thị Kim Oanh", address: "Số nhà 36, Ngõ 181, Đường Mai Thục Loan", nationalId: "0421 8306 0283", parentPhone1: "0909111222", loginEmail: "" };
  const base = { source: "PARENT" as const, invoice: { buyerName: "Lê Huy" }, studentNames: ["Lê Huy"], studentCode: "HV0001" };
  assert.deepEqual(resolveMisaBuyer({ ...base, student }), {
    fullName: "Lê Thị Kim Oanh", address: student.address, taxCode: "042183060283", email: "", phone: "0909111222",
  });
  // Ô "Mã số thuế" ở form được điền sẵn đúng CCCD này, nên gửi lên tường minh phải ra đúng cùng một người mua
  // (kể cả thứ tự khoá, vì dấu vân tay bản nháp băm theo JSON).
  const explicit = resolveMisaBuyer({ ...base, invoice: { ...base.invoice, buyerTaxCode: "042183060283" }, student });
  assert.equal(JSON.stringify(explicit), JSON.stringify(resolveMisaBuyer({ ...base, student })));
  // CCCD/MST là của phụ huynh (người đóng tiền): MST 10 số giữ nguyên, 13 số ghi dạng có gạch như MISA yêu cầu.
  assert.equal(resolveMisaBuyer({ ...base, student: { ...student, nationalId: "0101243150" } }).taxCode, "0101243150");
  assert.equal(resolveMisaBuyer({ ...base, student: { ...student, nationalId: "0101 243 150.733" } }).taxCode, "0101243150-733");
  for (const missing of [{ parentName: "" }, { address: "" }, { nationalId: "" }, { nationalId: "12345" }, { nationalId: "01012431501" }]) {
    const buyer = resolveMisaBuyer({ ...base, student: { ...student, ...missing } });
    assert.deepEqual(buyer, { fullName: MISA_ANONYMOUS_BUYER_NAME, email: "" }, JSON.stringify(missing));
  }
  // Khách không thông tin vẫn giữ email để MISA gửi hóa đơn.
  assert.equal(resolveMisaBuyer({ ...base, invoice: { ...base.invoice, buyerEmail: "ph@example.com" }, student: { ...student, nationalId: "" } }).email, "ph@example.com");
  // Có mã số thuế thì là hóa đơn đơn vị, giữ nguyên thông tin kế toán nhập.
  const company = resolveMisaBuyer({ ...base, invoice: { buyerName: "Công ty ABC", buyerTaxCode: "0101234567", buyerAddress: "Hà Tĩnh" }, student: { ...student, nationalId: "" } });
  assert.equal(company.fullName, "Công ty ABC");
  assert.equal(company.taxCode, "0101234567");
});

test("payload: CCCD điền vào mã số thuế, có mã số thuế (CCCD hay MST) thì luôn có Tên đơn vị vì MISA bắt buộc; khách không thông tin không gửi địa chỉ/SĐT/mã khách", () => {
  const draft = { refId: "r", invSeries: "1C26TST", taxRateLabel: "KCT", itemName: "x", amount: 900_000 };
  const personal = buildMisaInvoiceData({ ...draft, buyer: { fullName: "Lê Thị Kim Oanh", address: "Hà Tĩnh", taxCode: "042183060283" } });
  const company = buildMisaInvoiceData({ ...draft, buyer: { fullName: "Công ty ABC", address: "Hà Nội", taxCode: "0101234567" } });
  assert.ok(personal.ok && company.ok);
  if (personal.ok && company.ok) {
    assert.equal(personal.data.BuyerTaxCode, "042183060283");
    assert.equal(personal.data.BuyerLegalName, "Lê Thị Kim Oanh", "MISA báo lỗi nếu có BuyerTaxCode mà BuyerLegalName rỗng");
    assert.equal(company.data.BuyerTaxCode, "0101234567");
    assert.equal(company.data.BuyerLegalName, "Công ty ABC");
  }
  const full = buildMisaInvoiceData({ ...draft, buyer: { fullName: "Lê Thị Kim Oanh", address: "Hà Tĩnh", idNumber: "042183060283" } });
  const anonymous = buildMisaInvoiceData({ ...draft, buyer: { fullName: MISA_ANONYMOUS_BUYER_NAME } });
  assert.ok(full.ok && anonymous.ok);
  if (full.ok && anonymous.ok) {
    assert.equal(full.data.BuyerIDNumber, "042183060283");
    assert.equal(full.data.BuyerAddress, "Hà Tĩnh");
    assert.equal(anonymous.data.BuyerFullName, MISA_ANONYMOUS_BUYER_NAME);
    for (const key of ["BuyerAddress", "BuyerIDNumber", "BuyerPhoneNumber", "BuyerCode", "BuyerEmail"]) assert.equal(anonymous.data[key], "", key);
    assert.equal(anonymous.data.IsSendEmail, false);
  }
});

test("lưu cấu hình: patch không gửi invoiceFields thì giữ nguyên; gửi một phần thì gộp với giá trị đang lưu; mask luôn trả đủ", async () => {
  const misaPatch = { enabled: false, issueEnabled: false, baseUrl: "", clientId: "", taxCode: "", username: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" };
  const base = { sepay: { webhookMode: "API_KEY" as const }, zalo: { enabled: false, appId: "", oaId: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "" } };
  const legacy = defaultIntegrationSettings();
  delete (legacy.misa as Partial<typeof legacy.misa>).invoiceFields; // bản lưu cũ chưa có khối này
  assert.deepEqual(maskIntegrationSettings(legacy).misa.invoiceFields, DEFAULT_MISA_INVOICE_FIELDS);

  const key = "test-auth-secret-at-least-32-characters-long";
  const first = await mergeIntegrationSettings(legacy, { ...base, misa: { ...misaPatch, invoiceFields: { unitNameCourse: "Gói" } } } as IntegrationSettingsPatch, key, "admin");
  assert.equal(first.misa.invoiceFields.unitNameCourse, "Gói");
  assert.equal(first.misa.invoiceFields.itemNameTemplate, DEFAULT_MISA_INVOICE_FIELDS.itemNameTemplate);

  const second = await mergeIntegrationSettings(first, { ...base, misa: misaPatch } as IntegrationSettingsPatch, key, "admin");
  assert.deepEqual(second.misa.invoiceFields, first.misa.invoiceFields);
});
