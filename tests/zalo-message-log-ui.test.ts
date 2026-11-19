import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadZaloMessagesPage() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__zaloTest = { state, zaloMessagesPage, zaloMessageRows };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/tin-zalo" },
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
    __zaloTest: {
      state: { data: unknown };
      zaloMessagesPage: () => string;
      zaloMessageRows: () => Array<{ log: Record<string, unknown>; studentName: string }>;
    };
  }).__zaloTest;
}

function seed(ui: ReturnType<typeof loadZaloMessagesPage>, zaloMessages: Record<string, unknown>[] = []) {
  ui.state.data = {
    students: [{ id: "student-1", code: "HV0730", fullName: "Hạ An" }],
    zaloMessages,
  };
}

test("mỗi dòng OpsZaloMessageLog là một dòng trong bảng, tên học viên tra từ students", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, [
    { id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" },
  ]);
  const rows = ui.zaloMessageRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, "Hạ An");

  const html = ui.zaloMessagesPage();
  assert.match(html, /Hạ An/);
  assert.match(html, /84912345678/);
  assert.match(html, /Yêu cầu thanh toán/);
});

test("dòng FAILED hiện lỗi gần nhất và nút gửi lại; dòng khác trạng thái thì không", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, [
    { id: "zmsg-1", kind: "INVOICE_ISSUED", studentId: "student-1", phone: "84912345678", templateId: "tpl-2", status: "FAILED", errorCode: "INVALID_PHONE", errorMessage: "Số điện thoại phụ huynh không hợp lệ.", createdAt: "2026-10-22T04:00:00.000Z" },
    { id: "zmsg-2", kind: "PAYMENT_REQUEST", studentId: "student-1", phone: "84912345678", templateId: "tpl-1", status: "DELIVERED", createdAt: "2026-10-21T04:00:00.000Z" },
  ]);
  const html = ui.zaloMessagesPage();
  assert.match(html, /data-zalo-retry="zmsg-1"/);
  assert.doesNotMatch(html, /data-zalo-retry="zmsg-2"/);
  assert.match(html, /Số điện thoại phụ huynh không hợp lệ\./);
});

test("danh sách rỗng thì bảng hiện dòng hướng dẫn, không lỗi", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, []);
  const html = ui.zaloMessagesPage();
  assert.match(html, /Chưa có tin Zalo nào\./);
});

test("sắp xếp mới nhất lên trước theo createdAt", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, [
    { id: "zmsg-old", kind: "PAYMENT_REQUEST", studentId: "student-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-01T04:00:00.000Z" },
    { id: "zmsg-new", kind: "PAYMENT_REQUEST", studentId: "student-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" },
  ]);
  const rows = ui.zaloMessageRows();
  assert.equal(rows[0].log.id, "zmsg-new");
  assert.equal(rows[1].log.id, "zmsg-old");
});

const fullLog = {
  id: "zmsg-full", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", rawPhone: "0912 345 678",
  templateId: "tpl-1", status: "DELIVERED", providerMsgId: "msg-abc", providerSentTime: "1700000000000",
  createdAt: "2026-10-22T04:00:00.000Z", sentAt: "2026-10-22T04:00:05.000Z", deliveredAt: "2026-10-22T04:00:09.000Z",
  lastAttemptAt: "2026-10-22T04:00:05.000Z", attemptCount: 2, requestedBy: "ketoan@steps.vn",
  studentName: "Hạ An", studentCode: "HV0730", className: "S43",
  templateData: JSON.stringify({ order_code: "HPS43HV0730", ma_hoc_vien: "HV0730", transfer_amount: "1560000", loai_hoc_phi: "Theo khóa", ten_hoc_vien: "Hạ An" }),
  webhookAt: "2026-10-22T04:00:09.000Z", webhookPayload: "{\"msg_id\":\"msg-abc\"}",
};

test("bảng nhật ký hiện thêm lớp, mẫu tin, số tiền, mã tin Zalo, số lần gửi, người thực hiện và nút Xem", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, [fullLog]);
  const html = ui.zaloMessagesPage();
  assert.match(html, /S43/);
  assert.match(html, /tpl-1/);
  assert.match(html, /msg-abc/);
  assert.match(html, /ketoan@steps\.vn/);
  assert.match(html, /data-zalo-view="zmsg-full"/);
  assert.match(html, /1\.560\.000/);
});

test("dòng cũ chưa có dữ liệu bổ sung vẫn vẽ được, người thực hiện là Hệ thống tự động", () => {
  const ui = loadZaloMessagesPage();
  seed(ui, [{ id: "zmsg-old", kind: "INVOICE_ISSUED", studentId: "student-1", phone: "84912345678", templateId: "tpl-2", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" }]);
  const html = ui.zaloMessagesPage();
  assert.match(html, /Hệ thống tự động/);
  assert.match(html, /data-zalo-view="zmsg-old"/);
});

test("bấm Xem mở modal chi tiết với nội dung gửi lên Zalo, mốc thời gian giờ Việt Nam và webhook", () => {
  const ui = loadZaloMessagesPage() as ReturnType<typeof loadZaloMessagesPage> & { state: { financeModal?: unknown } };
  seed(ui, [fullLog]);
  assert.doesNotMatch(ui.zaloMessagesPage(), /Chi tiết tin Zalo/);
  ui.state.financeModal = { kind: "zalo-detail", id: "zmsg-full" };
  const html = ui.zaloMessagesPage();
  assert.match(html, /Chi tiết tin Zalo/);
  assert.match(html, /HPS43HV0730/);
  assert.match(html, /order_code/);
  assert.match(html, /Số tiền cần chuyển/);
  assert.match(html, /0912 345 678/, "hiện số thô khi khác số đã chuẩn hoá");
  assert.match(html, /11:00:05/, "04:00 UTC là 11:00 giờ Việt Nam");
  assert.match(html, /msg_id/);
});

test("tin cũ không có templateData thì tra số tiền từ khoản phải thu hoặc hóa đơn, ở cả bảng lẫn modal", () => {
  const ui = loadZaloMessagesPage() as ReturnType<typeof loadZaloMessagesPage> & { state: { data: Record<string, unknown>; financeModal?: unknown } };
  seed(ui, [
    { id: "zmsg-pay", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" },
    { id: "zmsg-inv", kind: "INVOICE_ISSUED", studentId: "student-1", invoiceId: "inv-1", phone: "84912345678", templateId: "tpl-2", status: "SENT", createdAt: "2026-10-21T04:00:00.000Z" },
  ]);
  ui.state.data.finance = { sepay: { receivables: [{ id: "recv-1", amountDue: 1560000 }], invoices: [{ id: "inv-1", amount: 3120000 }] } };
  const rows = ui.zaloMessageRows() as Array<{ log: { id: string }; amount: number | null }>;
  assert.equal(rows.find((row) => row.log.id === "zmsg-pay")?.amount, 1560000);
  assert.equal(rows.find((row) => row.log.id === "zmsg-inv")?.amount, 3120000);
  assert.match(ui.zaloMessagesPage(), /1\.560\.000/);
  ui.state.financeModal = { kind: "zalo-detail", id: "zmsg-pay" };
  assert.match(ui.zaloMessagesPage(), /zalo-bubble-amount/);
});

test("ghi chú thanh toán: tin mới lấy order_code đã gửi, tin cũ lùi về mã thật của phiếu", () => {
  const ui = loadZaloMessagesPage() as ReturnType<typeof loadZaloMessagesPage> & { state: { data: Record<string, unknown>; financeModal?: unknown } };
  seed(ui, [
    { id: "zmsg-new", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-23T04:00:00.000Z", templateData: JSON.stringify({ order_code: "HPS43HV0730" }) },
    { id: "zmsg-old", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-2", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" },
    { id: "zmsg-noclass", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-3", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-21T04:00:00.000Z" },
    { id: "zmsg-inv", kind: "INVOICE_ISSUED", studentId: "student-1", invoiceId: "inv-1", phone: "84912345678", templateId: "tpl-2", status: "SENT", createdAt: "2026-10-20T04:00:00.000Z" },
  ]);
  ui.state.data.classes = [{ id: "class-1", code: "S43" }];
  ui.state.data.finance = { sepay: {
    receivables: [
      { id: "recv-2", studentId: "student-1", classId: "class-1", paymentOrderId: "order-2", receivableCode: "RC2", amountDue: 1 },
      { id: "recv-3", studentId: "student-1", paymentOrderId: "order-3", receivableCode: "RC3", amountDue: 1 },
    ],
    paymentOrders: [{ id: "order-3", paymentCode: "HP8F4K92" }],
    invoices: [],
  } };
  const notes = Object.fromEntries((ui.zaloMessageRows() as Array<{ log: { id: string }; paymentNote: string }>).map((row) => [row.log.id, row.paymentNote]));
  assert.equal(notes["zmsg-new"], "HPS43HV0730");
  assert.equal(notes["zmsg-old"], "RC2", "order đã mất → lùi về receivableCode (mã thanh toán thật của phiếu lúc tạo)");
  assert.equal(notes["zmsg-noclass"], "HP8F4K92", "thiếu mã lớp thì lùi về mã lệnh thanh toán, giống server");
  assert.equal(notes["zmsg-inv"], "", "tin thông báo hóa đơn không có ghi chú thanh toán");
  const html = ui.zaloMessagesPage();
  assert.match(html, /Ghi chú thanh toán/);
  ui.state.financeModal = { kind: "zalo-detail", id: "zmsg-old" };
  assert.match(ui.zaloMessagesPage(), /zalo-bubble-row[\s\S]*Ghi chú thanh toán[\s\S]*RC2/);
});

test("modal chi tiết của dòng cũ không có templateData báo rõ không còn dữ liệu nội dung", () => {
  const ui = loadZaloMessagesPage() as ReturnType<typeof loadZaloMessagesPage> & { state: { financeModal?: unknown } };
  seed(ui, [{ id: "zmsg-old", kind: "PAYMENT_REQUEST", studentId: "student-1", phone: "84912345678", templateId: "tpl-1", status: "SENT", createdAt: "2026-10-22T04:00:00.000Z" }]);
  ui.state.financeModal = { kind: "zalo-detail", id: "zmsg-old" };
  assert.match(ui.zaloMessagesPage(), /Không còn dữ liệu nội dung/);
});

test("nội dung có ký tự HTML được escape trong modal", () => {
  const ui = loadZaloMessagesPage() as ReturnType<typeof loadZaloMessagesPage> & { state: { financeModal?: unknown } };
  seed(ui, [{ ...fullLog, templateData: JSON.stringify({ ten_hoc_vien: "<img src=x onerror=alert(1)>" }), webhookPayload: "<script>x</script>" }]);
  ui.state.financeModal = { kind: "zalo-detail", id: "zmsg-full" };
  const html = ui.zaloMessagesPage();
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>x/);
});
