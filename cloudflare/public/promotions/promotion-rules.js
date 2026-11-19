/*
 * Hàm tính toán khuyến mãi — THUẦN JAVASCRIPT PHÍA TRÌNH DUYỆT.
 * Không gọi API, không đọc database, không phụ thuộc UI: mọi hàm nhận dữ liệu
 * vào và trả kết quả ra, nên có thể test độc lập với promotion-ui.js.
 *
 * ngữ cảnh (ctx) dùng chung:
 *   { date, branch, student, courses: [{ id, name, tuition, sessions }],
 *     groupSize, prepayMonths, usedByStudent }
 */

/** Tra nhóm theo key. */
function pmGroup(data, key) {
  return data.groups.find((group) => group.key === key) || null;
}

/** Tra chương trình (type) của một nhóm theo key. */
function pmTypeOf(data, groupKey, typeKey) {
  const group = pmGroup(data, groupKey);
  return group ? group.types.find((type) => type.key === typeKey) || null : null;
}

function pmStatusMeta(data, status) {
  return data.statuses.find((item) => item.key === status) || { key: status, name: status, badge: "slate" };
}

function pmMethodName(data, method) {
  return (data.methods.find((item) => item.key === method) || {}).name || method;
}

/** Tên chương trình con (type) của một khuyến mãi. */
function pmPromotionTypeName(data, promotion) {
  return (pmTypeOf(data, promotion.group, promotion.type) || {}).name || promotion.type;
}

/** Khóa học thuộc phạm vi áp dụng của chương trình (rỗng = mọi khóa). */
function pmApplicableCourses(promotion, courses) {
  const list = promotion.courses || [];
  return list.length ? courses.filter((course) => list.includes(course.id)) : courses.slice();
}

/** Tổng học phí của phần khóa được áp dụng. */
function pmBaseTuition(promotion, courses) {
  return pmApplicableCourses(promotion, courses).reduce((sum, course) => sum + Number(course.tuition || 0), 0);
}

const pmDate = (value) => (value || "").slice(0, 10);

/** Ngày đang nằm trong khung chạy của chương trình. */
function pmDateActive(promotion, date) {
  const day = pmDate(date);
  return (!promotion.startDate || day >= promotion.startDate) && (!promotion.endDate || day <= promotion.endDate);
}

/**
 * Kiểm tra điều kiện áp dụng. Trả về { ok, blocks[], warnings[] } — blocks là lý do
 * không dùng được, warnings là điều kiện cần thêm (ví dụ hồ sơ cần duyệt).
 */
function pmPromotionEligibility(promotion, ctx, data) {
  const blocks = [];
  const warnings = [];
  const student = ctx.student || null;
  const courses = ctx.courses || [];
  const extra = promotion.extra || {};
  const tags = student ? student.tags || [] : [];
  const base = pmBaseTuition(promotion, courses);

  if (promotion.status !== "active") blocks.push(`Trạng thái ${pmStatusMeta(data, promotion.status).name.toLowerCase()}, chưa được áp dụng`);
  if (!pmDateActive(promotion, ctx.date)) blocks.push(`Ngoài khung ${promotion.startDate || "…"} → ${promotion.endDate || "…"}`);
  if (base <= 0) blocks.push("Không có khóa học nào thuộc phạm vi áp dụng");
  else if (promotion.minTuition > 0 && base < promotion.minTuition) blocks.push(`Cần học phí tối thiểu ${pmFormatMoney(promotion.minTuition)} (đang ${pmFormatMoney(base)})`);
  if ((promotion.branches || []).length && !promotion.branches.includes(ctx.branch)) blocks.push("Không áp dụng cho chi nhánh đã chọn");
  if ((promotion.tags || []).length && !promotion.tags.some((tag) => tags.includes(tag))) blocks.push(`Dành cho ${promotion.tags.map((tag) => (data.studentTags.find((item) => item.key === tag) || {}).name || tag).join(" / ")}`);
  if (promotion.usageLimit > 0 && promotion.usedCount >= promotion.usageLimit) blocks.push(`Đã dùng hết ${promotion.usageLimit} lượt`);
  if (promotion.usagePerStudent > 0 && (ctx.usedByStudent || 0) >= promotion.usagePerStudent) blocks.push(`Học viên đã dùng đủ ${promotion.usagePerStudent} lượt`);

  switch (promotion.type) {
    case "sibling":
      if (courses.length < 2) blocks.push("Cần từ 2 khóa (chỉ giảm cho khóa thứ hai)");
      break;
    case "loyalty":
      if (extra.monthsRequired && (!student || (student.months || 0) < extra.monthsRequired)) blocks.push(`Cần gắn bó từ ${extra.monthsRequired} tháng`);
      break;
    case "groupStudent":
    case "group3":
      if ((ctx.groupSize || 1) < (extra.minStudents || 3)) blocks.push(`Cần nhóm từ ${extra.minStudents || 3} học viên`);
      break;
    case "bundle2":
    case "bundle3":
    case "bundle4":
      if (courses.length < (extra.minCourses || 2)) blocks.push(`Cần đăng ký từ ${extra.minCourses || 2} khóa`);
      break;
    case "prepay3":
    case "prepay6":
      if ((ctx.prepayMonths || 0) < (extra.prepayMonths || 3)) blocks.push(`Cần đóng trước ${extra.prepayMonths} tháng`);
      break;
    case "bogo":
      if (courses.length < (extra.buyCount || 2)) blocks.push(`Cần mua tối thiểu ${extra.buyCount || 2} khóa`);
      break;
    case "academic":
      if (!student || (student.grade || 0) < (extra.gradeMin || 8.5)) blocks.push(`Cần học lực từ ${extra.gradeMin || 8.5}`);
      break;
    case "birthday":
      if (!tags.includes("birthday")) blocks.push("Chỉ dành cho học viên có sinh nhật trong kỳ");
      break;
    case "newStudent":
      if (!tags.includes("new")) blocks.push("Chỉ dành cho học viên mới");
      break;
    case "reEnroll":
      if (!tags.includes("studying") && !tags.includes("returning")) blocks.push("Chỉ dành cho học viên đăng ký lại");
      break;
    default:
      break;
  }

  if (promotion.approvalRequired) warnings.push("Hồ sơ cần người phê duyệt trước khi tính giảm");
  if (promotion.group === "scholarship") warnings.push("Thuộc nhóm học bổng — cần đơn và lý do");
  if (!promotion.stackable) warnings.push("Không cộng gộp với chương trình khác");

  return { ok: blocks.length === 0, blocks, warnings };
}

/** Số tiền giảm của một khóa/khoản tính theo phương thức. */
function pmDiscountAmount(promotion, ctx) {
  const courses = ctx.courses || [];
  const extra = promotion.extra || {};
  const applicable = pmApplicableCourses(promotion, courses);
  const total = applicable.reduce((sum, course) => sum + Number(course.tuition || 0), 0);
  let amount = 0;
  let detail = "";

  switch (promotion.method) {
    case "percent": {
      if (promotion.type === "sibling" && applicable.length >= 2) {
        const cheapest = Math.min(...applicable.map((course) => Number(course.tuition || 0)));
        amount = (cheapest * promotion.value) / 100;
        detail = `${promotion.value}% khóa rẻ nhất (${pmFormatMoney(cheapest)})`;
      } else {
        amount = (total * promotion.value) / 100;
        detail = `${promotion.value}% × ${pmFormatMoney(total)}`;
      }
      break;
    }
    case "amount":
      amount = Math.min(Number(promotion.value) || 0, total);
      detail = `Giảm trực tiếp ${pmFormatMoney(Number(promotion.value) || 0)}`;
      break;
    case "free_course": {
      const buy = Number(extra.buyCount || 1);
      const free = Number(extra.freeCount || promotion.value || 1);
      const sets = buy > 0 ? Math.floor(applicable.length / buy) : 0;
      const count = Math.min(sets * free, applicable.length);
      const sorted = applicable.map((course) => Number(course.tuition || 0)).sort((a, b) => a - b);
      amount = sorted.slice(0, count).reduce((sum, value) => sum + value, 0);
      detail = count ? `Tặng ${count} khóa (${pmFormatMoney(amount)})` : `Chưa đủ ${buy} khóa để tặng`;
      break;
    }
    case "free_session": {
      const sessions = applicable.reduce((sum, course) => sum + Number(course.sessions || 0), 0);
      const pricePerSession = sessions ? total / sessions : 0;
      const count = Number(promotion.value) || 0;
      amount = pricePerSession * Math.min(count, sessions);
      detail = `${count} buổi × ${pmFormatMoney(Math.round(pricePerSession))}/buổi`;
      break;
    }
    default:
      amount = 0;
      detail = "Chưa cấu hình phương thức giảm";
  }

  const cap = Number(promotion.maxDiscount || 0);
  let capped = false;
  if (cap > 0 && amount > cap) { amount = cap; capped = true; }
  amount = Math.max(0, Math.round(amount));
  return { amount, detail: capped ? `${detail}, áp trần ${pmFormatMoney(cap)}` : detail, capped };
}

/** Giá trị còn lại sau khi trừ khuyến mãi. */
function pmPayable(total, discount) {
  return Math.max(0, Math.round(Number(total) || 0) - Math.round(Number(discount) || 0));
}

/**
 * Mô phỏng: với ngữ cảnh đã chọn, liệt kê mọi phương án (từng chương trình đơn lẻ,
 * từng voucher còn hiệu lực, và combo cộng gộp các chương trình stackable) rồi xếp
 * hạng theo số tiền giảm.
 */
function pmSimulate(ctx, data, promotions, vouchers) {
  const courses = ctx.courses || [];
  const total = courses.reduce((sum, course) => sum + Number(course.tuition || 0), 0);
  const eligible = [];
  const excluded = [];

  for (const promotion of promotions) {
    const check = pmPromotionEligibility(promotion, ctx, data);
    const money = check.ok ? pmDiscountAmount(promotion, ctx) : { amount: 0, detail: "" };
    const row = { promotion, check, amount: money.amount, detail: money.detail, kind: "promotion" };
    (check.ok ? eligible : excluded).push(row);
  }

  const usableVouchers = [];
  for (const voucher of vouchers || []) {
    if (voucher.status !== "unused") continue;
    const promotion = promotions.find((item) => item.id === voucher.promotionId);
    if (!promotion) continue;
    const check = pmPromotionEligibility(promotion, ctx, data);
    if (!check.ok) continue;
    const fixed = promotion.method === "amount" || promotion.method === "free_session";
    const money = fixed && voucher.amount ? { amount: voucher.amount, detail: `Mã ${voucher.code}` } : pmDiscountAmount(promotion, ctx);
    usableVouchers.push({ voucher, promotion, amount: money.amount, detail: money.detail || `Mã ${voucher.code}`, kind: "voucher" });
  }

  const stackable = eligible.filter((row) => row.promotion.stackable);
  const combos = [];
  if (stackable.length > 1) {
    const sum = stackable.reduce((acc, row) => acc + row.amount, 0);
    combos.push({
      kind: "combo",
      label: `Cộng gộp ${stackable.length} chương trình cộng gộp được`,
      rows: stackable,
      amount: Math.min(sum, Math.max(0, total)),
      detail: stackable.map((row) => row.promotion.code).join(" + "),
    });
  }

  const single = eligible.map((row) => ({ kind: "single", label: row.promotion.name, rows: [row], amount: row.amount, detail: row.promotion.code }));
  const voucherOptions = usableVouchers.map((row) => ({ kind: "voucher", label: `Voucher ${row.voucher.code}`, rows: [{ promotion: row.promotion, amount: row.amount, detail: row.detail, check: row.promotion ? { ok: true, blocks: [], warnings: [] } : null }], amount: row.amount, detail: row.voucher.code }));
  const options = [...single, ...voucherOptions, ...combos]
    .map((option) => ({ ...option, payable: pmPayable(total, option.amount), rate: total ? option.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const best = options[0] || null;
  return { total, eligible, excluded, vouchers: usableVouchers, options, best };
}

/** Khoá "2026-11" của một ngày ISO. */
function pmMonthKey(date) {
  return pmDate(date).slice(0, 7);
}

const PM_MONTH_LABEL = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

/** 12 tháng gần nhất tính từ `today` (mã "YYYY-MM" + nhãn "MM/YYYY"). */
function pmRecentMonths(today, count = 12) {
  const base = new Date(`${pmDate(today)}T00:00:00`);
  const months = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${PM_MONTH_LABEL[date.getMonth()]}`;
    months.push({ key, label: `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}` });
  }
  return months;
}

/** Bộ lọc dashboard: khoảng ngày, chi nhánh, nhóm. */
function pmMatchFilters(promotion, filters) {
  if (filters.branch && (promotion.branches || []).length && !promotion.branches.includes(filters.branch)) return false;
  if (filters.group && promotion.group !== filters.group) return false;
  if (filters.from && promotion.endDate && promotion.endDate < filters.from) return false;
  if (filters.to && promotion.startDate && promotion.startDate > filters.to) return false;
  return true;
}

/**
 * Tổng hợp cho dashboard: 6 chỉ số + 3 biểu đồ (voucher theo tháng, giá trị giảm
 * theo nhóm, top chương trình dùng nhiều). chỉ tính trên dữ liệu đã lọc.
 */
function pmAggregates(data, promotions, vouchers, usage, filters, today) {
  const scoped = promotions.filter((promotion) => pmMatchFilters(promotion, filters));
  const ids = new Set(scoped.map((promotion) => promotion.id));
  const scopedVouchers = (vouchers || []).filter((voucher) => ids.has(voucher.promotionId));
  const scopedUsage = (usage || []).filter((row) => ids.has(row.promotionId));

  const months = pmRecentMonths(today, 12);
  const voucherByMonth = months.map((month) => ({
    ...month,
    count: scopedVouchers.filter((voucher) => voucher.issuedAt && voucher.issuedAt.slice(0, 7) === month.key).length,
    used: scopedVouchers.filter((voucher) => voucher.usedAt && voucher.usedAt.slice(0, 7) === month.key).length,
  }));

  const byGroup = data.groups.map((group) => {
    const rows = scoped.filter((promotion) => promotion.group === group.key);
    return {
      key: group.key,
      label: group.name,
      count: rows.length,
      amount: rows.reduce((sum, promotion) => sum + Number(promotion.usedAmount || 0), 0),
    };
  });
  const groupTotal = byGroup.reduce((sum, row) => sum + row.amount, 0);

  const top = scoped
    .map((promotion) => ({ id: promotion.id, code: promotion.code, name: promotion.name, group: promotion.group, usedCount: Number(promotion.usedCount || 0), amount: Number(promotion.usedAmount || 0) }))
    .sort((a, b) => b.usedCount - a.usedCount)
    .slice(0, 6);

  return {
    totals: {
      programs: scoped.length,
      active: scoped.filter((promotion) => promotion.status === "active").length,
      pending: scoped.filter((promotion) => promotion.status === "pending").length,
      expired: scoped.filter((promotion) => promotion.status === "expired").length,
      usages: scopedUsage.length,
      discount: scoped.reduce((sum, promotion) => sum + Number(promotion.usedAmount || 0), 0),
      vouchers: scopedVouchers.length,
      voucherUsed: scopedVouchers.filter((voucher) => voucher.status === "used").length,
    },
    voucherByMonth,
    byGroup: byGroup.map((row) => ({ ...row, share: groupTotal ? row.amount / groupTotal : 0 })),
    top,
  };
}

/** Định dạng tiền Việt, dùng nội bộ module (không phụ thuộc app.js). */
function pmFormatMoney(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("vi-VN")} ₫`;
}

/** Định dạng ngày ISO → dd/MM/yyyy. */
function pmFormatDate(value) {
  const date = pmDate(value);
  if (!date || date.length < 10) return "—";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Sinh lô mã voucher mới, tránh trùng mã đã tồn tại. */
function pmGenerateCodes(prefix, count, existingCodes) {
  const clean = String(prefix || "VOUCHER").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "VOUCHER";
  const taken = new Set(existingCodes || []);
  const codes = [];
  let seed = 1000 + taken.size * 7;
  while (codes.length < Math.max(0, Math.min(Number(count) || 0, 200))) {
    seed += 37;
    const code = `${clean}-${String(seed % 10000).padStart(4, "0")}`;
    if (taken.has(code)) continue;
    taken.add(code);
    codes.push(code);
  }
  return codes;
}

/** Dựng nội dung CSV (bom Unicode để Excel mở đúng tiếng Việt). */
function pmCsv(headers, rows) {
  const cell = (value) => {
    const text = String(value ?? "").replace(/"/g, '""');
    return /[",\n;]/.test(text) ? `"${text}"` : text;
  };
  return `${[headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\r\n")}`;
}

/**
 * Điều kiện động của một nhóm/nhà cung cấp quyết định trường nào xuất hiện trong
 * tab "Điều kiện" và "Cấu hình giảm giá" của form.
 */
function pmDynamicFields(data, groupKey, typeKey) {
  const type = pmTypeOf(data, groupKey, typeKey);
  return type ? type.fields.slice() : [];
}

if (typeof window !== "undefined") {
  window.StepsPromotionRules = {
    pmGroup,
    pmTypeOf,
    pmStatusMeta,
    pmMethodName,
    pmPromotionTypeName,
    pmApplicableCourses,
    pmBaseTuition,
    pmDateActive,
    pmPromotionEligibility,
    pmDiscountAmount,
    pmPayable,
    pmSimulate,
    pmAggregates,
    pmGenerateCodes,
    pmCsv,
    pmDynamicFields,
    pmFormatMoney,
    pmFormatDate,
  };
}
