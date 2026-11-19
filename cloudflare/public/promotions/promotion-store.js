/*
 * State phía trình duyệt của module khuyến mãi.
 * Dữ liệu nghiệp vụ đến từ promotion-mock-data.js, bản chỉnh sửa của người dùng
 * lưu ở localStorage để F5 không mất. Không có bất kỳ luồng gọi API nào ở file này.
 */

const PM_STORAGE_KEY = "steps:promotions:mock:v1";

/** Danh mục cố định (khóa học, chi nhánh, nhóm…) luôn lấy từ file mock data. */
function pmCatalog() {
  const fixture = (typeof window !== "undefined" && window.PM_FIXTURE) || { promotions: [], vouchers: [], usage: [], scholarships: [] };
  return fixture;
}

function pmClonePromotions(fixture) {
  return (fixture.promotions || []).map((promotion) => ({ ...promotion, courses: [...(promotion.courses || [])], branches: [...(promotion.branches || [])], tags: [...(promotion.tags || [])], extra: { ...(promotion.extra || {}) } }));
}

function pmSeedState() {
  const fixture = pmCatalog();
  return {
    version: fixture.version || 1,
    today: pmToday(),
    promotions: pmClonePromotions(fixture),
    vouchers: (fixture.vouchers || []).map((voucher) => ({ ...voucher })),
    usage: (fixture.usage || []).map((row) => ({ ...row })),
    scholarships: (fixture.scholarships || []).map((row) => ({ ...row })),
  };
}

/** Hôm nay theo múi giờ máy, dạng YYYY-MM-DD. */
function pmToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

let pmState = null;

/** Đọc state (một lần) từ localStorage, tự seed dữ liệu mẫu nếu chưa có. */
function pmStore() {
  if (pmState) return pmState;
  const seed = pmSeedState();
  let stored = null;
  try {
    const raw = window.localStorage?.getItem(PM_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = null;
  }
  if (stored && Number(stored.version) === seed.version && Array.isArray(stored.promotions)) {
    pmState = { ...seed, ...stored };
  } else {
    pmState = seed;
  }
  return pmState;
}

/** Ghi state xuống localStorage — mọi thao tác sửa đều gọi hàm này. */
function pmPersist() {
  try {
    window.localStorage?.setItem(PM_STORAGE_KEY, JSON.stringify(pmStore()));
  } catch {
    /* localStorage đầy hoặc bị chặn: dữ liệu vẫn còn trong bộ nhớ phiên làm việc. */
  }
}

/** Quay lại đúng dữ liệu mẫu, bỏ mọi chỉnh sửa đã lưu. */
function pmResetStore() {
  pmState = { ...pmSeedState(), version: pmCatalog().version };
  pmPersist();
}

const pmNextId = (prefix, rows) => `${prefix}-${String(rows.length + 1).padStart(2, "0")}${Date.now().toString(36).slice(-3)}`;

/** Một bản ghi khuyến mãi mới với giá trị mặc định an toàn. */
function pmBlankPromotion() {
  return {
    id: "",
    code: "",
    name: "",
    group: "customer",
    type: "sibling",
    method: "percent",
    value: 10,
    maxDiscount: 0,
    minTuition: 0,
    branches: [],
    courses: [],
    tags: [],
    startDate: pmToday(),
    endDate: "",
    usageLimit: 0,
    usagePerStudent: 0,
    stackable: false,
    approvalRequired: false,
    status: "draft",
    usedCount: 0,
    usedAmount: 0,
    extra: {},
    createdBy: (typeof state !== "undefined" && state?.data?.user?.name) || "Quản trị",
    createdAt: pmToday(),
    note: "",
  };
}

/** Tạo mới khuyến mãi từ dữ liệu form. */
function pmCreatePromotion(input) {
  const store = pmStore();
  const promotion = { ...pmBlankPromotion(), ...input, id: pmNextId("km", store.promotions) };
  store.promotions.unshift(promotion);
  pmPersist();
  return promotion;
}

/** Cập nhật có kiểm soát: chỉ ghi đè các key nằm trong bản ghi đã có. */
function pmUpdatePromotion(id, patch) {
  const store = pmStore();
  const promotion = store.promotions.find((item) => item.id === id);
  if (!promotion) return null;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id") continue;
    if (!(key in promotion) && !["extra", "branches", "courses", "tags"].includes(key)) continue;
    promotion[key] = value;
  }
  pmPersist();
  return promotion;
}

/** Nhân bản một chương trình thành bản nháp mới (hậu tố -COPY). */
function pmDuplicatePromotion(id) {
  const store = pmStore();
  const source = store.promotions.find((item) => item.id === id);
  if (!source) return null;
  const copy = {
    ...source,
    id: pmNextId("km", store.promotions),
    code: `${source.code}-COPY`.slice(0, 20),
    name: `${source.name} (bản sao)`,
    status: "draft",
    usedCount: 0,
    usedAmount: 0,
    createdAt: pmToday(),
    courses: [...(source.courses || [])],
    branches: [...(source.branches || [])],
    tags: [...(source.tags || [])],
    extra: { ...(source.extra || {}) },
  };
  store.promotions.unshift(copy);
  pmPersist();
  return copy;
}

/** Xóa hẳn một chương trình (kèm voucher và lịch sử phát sinh từ nó). */
function pmDeletePromotion(id) {
  const store = pmStore();
  store.promotions = store.promotions.filter((item) => item.id !== id);
  store.vouchers = store.vouchers.filter((item) => item.promotionId !== id);
  store.usage = store.usage.filter((item) => item.promotionId !== id);
  pmPersist();
}

/** Bật / tắt hoặc chuyển trạng thái nghiệp vụ của chương trình. */
function pmSetPromotionStatus(id, status) {
  const promotion = pmUpdatePromotion(id, { status });
  if (promotion) pmPersist();
  return promotion;
}

/** Phát hành lô voucher cho một chương trình. */
function pmGenerateVouchers(promotionId, prefix, count) {
  const store = pmStore();
  const codes = pmGenerateCodes(prefix, count, store.vouchers.map((voucher) => voucher.code));
  const rows = codes.map((code) => ({ id: pmNextId("vc", store.vouchers), code, promotionId, holder: "", status: "unused", issuedAt: pmToday(), usedAt: "", amount: 0 }));
  store.vouchers.unshift(...rows);
  pmPersist();
  return rows;
}

function pmSetVoucherStatus(id, status, patch = {}) {
  const store = pmStore();
  const voucher = store.vouchers.find((item) => item.id === id);
  if (!voucher) return null;
  Object.assign(voucher, patch, { status });
  pmPersist();
  return voucher;
}

/** Gán người giữ mã khi phát voucher cho một học viên. */
function pmAssignVoucher(id, holder) {
  return pmSetVoucherStatus(id, "unused", { holder });
}

/** Duyệt hoặc từ chối một hồ sơ học bổng; khi duyệt ghi thêm một lượt dùng. */
function pmDecideScholarship(id, decision, note) {
  const store = pmStore();
  const row = store.scholarships.find((item) => item.id === id);
  if (!row) return null;
  row.status = decision;
  row.note = note || "";
  row.decidedAt = pmToday();
  if (decision === "approved") {
    const promotion = store.promotions.find((item) => item.id === row.promotion);
    if (promotion) {
      promotion.usedCount = Number(promotion.usedCount || 0) + 1;
      promotion.usedAmount = Number(promotion.usedAmount || 0) + Number(row.requestedAmount || 0);
    }
    store.usage.unshift({
      id: pmNextId("us", store.usage),
      date: pmToday(),
      promotionId: row.promotion,
      student: row.student,
      course: row.course,
      branch: row.branch,
      amount: Number(row.requestedAmount || 0),
      channel: "Xét học bổng",
    });
  }
  pmPersist();
  return row;
}

/** Tra một khuyến mãi theo id. */
function pmFindPromotion(id) {
  return pmStore().promotions.find((item) => item.id === id) || null;
}

if (typeof window !== "undefined") {
  window.StepsPromotionStore = {
    key: PM_STORAGE_KEY,
    pmStore,
    pmCatalog,
    pmPersist,
    pmResetStore,
    pmToday,
    pmBlankPromotion,
    pmCreatePromotion,
    pmUpdatePromotion,
    pmDuplicatePromotion,
    pmDeletePromotion,
    pmSetPromotionStatus,
    pmGenerateVouchers,
    pmSetVoucherStatus,
    pmAssignVoucher,
    pmDecideScholarship,
    pmFindPromotion,
  };
}
