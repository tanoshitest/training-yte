/*
 * Màn hình nghiệp vụ của module Cấu hình khuyến mãi.
 * Chỉ chạy phía trình duyệt: dữ liệu lấy từ promotion-store.js (localStorage),
 * số liệu tính bằng promotion-rules.js. Không có bất kỳ lệnh gọi API nào ở đây.
 */

const PM_TABS = [
  { key: "dashboard", name: "Tổng quan" },
  { key: "list", name: "Danh sách khuyến mãi" },
  { key: "vouchers", name: "Voucher" },
  { key: "approvals", name: "Duyệt học bổng" },
  { key: "history", name: "Lịch sử sử dụng" },
  { key: "simulator", name: "Mô phỏng giảm giá" },
];

const PM_FORM_TABS = [
  { key: "general", name: "Thông tin chung" },
  { key: "conditions", name: "Điều kiện áp dụng" },
  { key: "discount", name: "Cấu hình giảm giá" },
  { key: "students", name: "Học viên áp dụng" },
  { key: "courses", name: "Khóa học áp dụng" },
  { key: "limits", name: "Giới hạn sử dụng" },
  { key: "approval", name: "Phê duyệt & phân quyền" },
];

/** State giao diện — chỉ sống trong phiên, dữ liệu nghiệp vụ nằm ở localStorage. */
const pmUi = {
  tab: "dashboard",
  view: "",
  detailId: "",
  modal: null,
  draft: null,
  draftTab: "general",
  list: { q: "", group: "", status: "", branch: "", sort: "recent", page: 1, pageSize: 10 },
  vouchers: { q: "", status: "", promotion: "" },
  history: { q: "", group: "", from: "", to: "" },
  approvals: { status: "pending" },
  dash: { branch: "", group: "", from: "", to: "" },
  sim: { studentId: "", branch: "br-1", date: "", courses: [], groupSize: 1, prepayMonths: 0, choice: "" },
};

/** Bộ dữ liệu đang dùng — giữ hàm này để gỡ lỗi nhanh từ console. */
function pmPromotionExtraLabel(key) {
  return {
    siblingRelation: "Quan hệ anh chị em",
    appliesTo: "Phạm vi áp dụng",
    rewardTarget: "Đối tượng được hưởng",
    requiresReferral: "Cần mã giới thiệu",
    monthsRequired: "Số tháng gắn bó tối thiểu",
    partnerName: "Đối tác",
    minStudents: "Số học viên tối thiểu",
    minCourses: "Số khóa tối thiểu",
    prepayMonths: "Số tháng đóng trước",
    buyCount: "Số khóa phải mua",
    freeCount: "Số khóa được tặng",
    sessionCount: "Số buổi được miễn",
    reason: "Lý do xét",
    gradeMin: "Điểm trung bình tối thiểu",
    approver: "Người phê duyệt",
    earlyDays: "Số ngày đăng ký sớm",
    windowHours: "Thời lượng (giờ)",
    voucherPrefix: "Đầu mã voucher",
    voucherQuantity: "Số voucher lô đầu",
    paymentStage: "Kỳ đóng tiền",
    maxDiscount: "Mức giảm tối đa",
  }[key] || key;
}

function pmPromotionById(id) {
  return pmStore().promotions.find((item) => item.id === id) || null;
}

function pmCourseName(id) {
  return (pmCatalog().courses.find((course) => course.id === id) || {}).name || "—";
}

function pmBranchName(id) {
  return (pmCatalog().branches.find((branch) => branch.id === id) || {}).name || "Toàn trung tâm";
}

function pmTagName(key) {
  return (pmCatalog().studentTags.find((tag) => tag.key === key) || {}).name || key;
}

/** Vẽ nhãn trạng thái theo bảng màu badge sẵn có của hệ thống. */
function pmStatusBadge(status) {
  const meta = pmStatusMeta(pmCatalog(), status);
  return `<span class="badge badge-${meta.badge}">${escapeHtml(meta.name)}</span>`;
}

/** Vẽ badge phương thức giảm giá. */
function pmMethodBadge(promotion) {
  const label = promotion.method === "percent" ? `${promotion.value}%` : promotion.method === "amount" ? pmFormatMoney(promotion.value) : promotion.method === "free_course" ? `Tặng ${promotion.value} khóa` : `Miễn ${promotion.value} buổi`;
  return `<span class="badge badge-blue">${escapeHtml(label)}</span>`;
}

/** Vẽ lại toàn bộ khung khuyến mãi (giữ cuộn + con trỏ ô đang nhập). */
function pmRefresh() {
  const root = document.querySelector(".pm-root");
  if (!root) { render(); return; }
  const active = document.activeElement;
  const caret = active && active.id && root.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const scroll = root.querySelector("[data-pm-scroll]")?.scrollTop || 0;
  root.innerHTML = promotionBody();
  // innerHTML mới hoàn toàn nên phải nối lại sự kiện, nếu không chỉ lượt bấm đầu tiên hoạt động.
  bindPromotionEvents();
  const bar = document.querySelector("[data-pm-scroll]");
  if (bar) bar.scrollTop = scroll;
  if (caret) {
    const node = document.getElementById(caret.id);
    if (node) { node.focus(); try { node.setSelectionRange(caret.start, caret.end); } catch { /* ô số không hỗ trợ con trỏ */ } }
  }
}

/** Đầu vào số cho form khuyến mãi. */
function pmNumberField(label, name, value, options = "", hint = "") {
  return `<label class="field"><span>${label}</span><input class="input tabular" type="number" name="${name}" data-pm-input="${name}" value="${escapeHtml(value ?? 0)}" ${options} />${hint ? `<small>${hint}</small>` : ""}</label>`;
}

/** Khối checkbox chọn nhiều (chi nhánh, khóa học, thẻ học viên). */
function pmCheckGrid(name, items, selected, columns = 2) {
  const boxes = items.map((item) => `<label class="pm-check pm-check-${columns}"><input type="checkbox" data-pm-multi="${name}" value="${escapeHtml(item.id || item.key)}" ${selected.includes(item.id || item.key) ? "checked " : ""} /><span>${escapeHtml(item.name)}</span></label>`).join("");
  return `<div class="pm-check-grid">${boxes || '<p class="pm-muted">Danh sách trống.</p>'}</div>`;
}

/** Điều kiện riêng của từng loại chương trình — form động theo nhóm. */
function pmTypeFields(catalog, draft) {
  const fields = pmDynamicFields(catalog, draft.group, draft.type);
  const extra = draft.extra || {};
  const input = (key, label, value, options = "", hint = "") => `<label class="field"><span>${label}</span><input class="input" data-pm-extra="${key}" value="${escapeHtml(value ?? "")}" ${options} />${hint ? `<small>${hint}</small>` : ""}</label>`;
  const rows = [];
  if (fields.includes("siblingRelation")) rows.push(input("siblingRelation", "Quan hệ anh chị em", extra.siblingRelation, 'placeholder="Anh/chị/em ruột"', "Cặp anh chị em phải cùng đóng phí trong một kỳ."));
  if (fields.includes("appliesTo")) rows.push(input("appliesTo", "Phạm vi áp dụng", extra.appliesTo));
  if (fields.includes("rewardTarget")) rows.push(input("rewardTarget", "Đối tượng được hưởng", extra.rewardTarget));
  if (fields.includes("requiresReferral")) rows.push(`<label class="field"><span>Cần mã giới thiệu</span><select class="input" data-pm-extra="requiresReferral"><option value="false" ${extra.requiresReferral ? "" : "selected"}>Không</option><option value="true" ${extra.requiresReferral ? "selected" : ""}>Có</option></select></label>`);
  if (fields.includes("monthsRequired")) rows.push(input("monthsRequired", "Số tháng gắn tối thiểu", extra.monthsRequired, 'type="number" min="0"'));
  if (fields.includes("partnerName")) rows.push(input("partnerName", "Tên đối tác", extra.partnerName));
  if (fields.includes("minStudents")) rows.push(input("minStudents", "Số học viên tối thiểu của nhóm", extra.minStudents, 'type="number" min="1"'));
  if (fields.includes("minCourses")) rows.push(input("minCourses", "Số khóa tối thiểu", extra.minCourses, 'type="number" min="1"'));
  if (fields.includes("prepayMonths")) rows.push(input("prepayMonths", "Số tháng đóng trước", extra.prepayMonths, 'type="number" min="1"'));
  if (fields.includes("buyCount")) rows.push(input("buyCount", "Số khóa phải mua (X)", extra.buyCount, 'type="number" min="1"'));
  if (fields.includes("freeCount")) rows.push(input("freeCount", "Số khóa được tặng (Y)", extra.freeCount, 'type="number" min="1"'));
  if (fields.includes("sessionCount")) rows.push(input("sessionCount", "Số buổi được miễn", extra.sessionCount, 'type="number" min="1"'));
  if (fields.includes("reason")) rows.push(input("reason", "Lý do xét học bổng", extra.reason, 'placeholder="Hoàn cảnh, thành tích…"'));
  if (fields.includes("gradeMin")) rows.push(input("gradeMin", "Điểm trung bình tối thiểu", extra.gradeMin, 'type="number" step="0.1" min="0" max="10"'));
  if (fields.includes("approver")) rows.push(`<label class="field"><span>Người phê duyệt</span><select class="input" data-pm-extra="approver">${catalog.approvers.map((name) => `<option value="${escapeHtml(name)}" ${extra.approver === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`);
  if (fields.includes("earlyDays")) rows.push(input("earlyDays", "Số ngày đăng ký sớm", extra.earlyDays, 'type="number" min="1"'));
  if (fields.includes("windowHours")) rows.push(input("windowHours", "Thời lượng chương trình (giờ)", extra.windowHours, 'type="number" min="1"', "Flash Sale chỉ chạy đúng số giờ này."));
  if (fields.includes("voucherPrefix")) rows.push(input("voucherPrefix", "Đầu mã voucher", extra.voucherPrefix, 'placeholder="NEWSTU"'));
  if (fields.includes("voucherQuantity")) rows.push(input("voucherQuantity", "Số voucher phát hành lô đầu", extra.voucherQuantity, 'type="number" min="0"'));
  if (fields.includes("paymentStage")) rows.push(input("paymentStage", "Kỳ đóng tiền áp dụng", extra.paymentStage, 'placeholder="Lần đầu / lần tiếp theo"'));
  return rows.length ? `<div class="pm-dynamic"><h3>Điều kiện riêng của chương trình</h3><div class="form-grid">${rows.join("")}</div></div>` : "";
}

/* ------------------------------------------------------------------ Tổng quan */

function pmKpiTile(label, value, hint) {
  return `<article class="pm-kpi"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

/** Biểu đồ cột voucher theo tháng — SVG thuần, không thư viện. */
function pmMonthChart(rows) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const width = 26;
  const gap = 8;
  const height = 150;
  const barWidth = 10;
  const bars = rows.map((row, index) => {
    const issued = Math.round((row.count / max) * (height - 22));
    const used = Math.round((row.used / max) * (height - 22));
    const x = index * (width + gap) + 4;
    return `<g><rect class="pm-bar-ghost" x="${x}" y="0" width="${width}" height="${height}" rx="3" /><rect class="pm-bar" x="${x + 2}" y="${height - issued}" width="${barWidth}" height="${issued}" rx="2"><title>${escapeHtml(row.label)}: phát hành ${row.count}</title></rect><rect class="pm-bar pm-bar-used" x="${x + width / 2 + 1}" y="${height - used}" width="${barWidth}" height="${used}" rx="2"><title>${escapeHtml(row.label)}: dùng ${row.used}</title></rect><text class="pm-axis" x="${x + width / 2}" y="${height + 14}" text-anchor="middle">${row.label.slice(0, 2)}</text></g>`;
  }).join("");
  return `<div class="pm-scroll-x"><svg class="pm-chart" viewBox="0 0 ${rows.length * (width + gap) + 8} ${height + 22}" height="${height + 22}" role="img" aria-label="Voucher phát hành theo tháng">${bars}</svg></div><p class="pm-legend"><i class="pm-dot"></i>Phát hành<i class="pm-dot pm-dot-used"></i>Đã dùng</p>`;
}

/** Giá trị giảm theo nhóm — thanh ngang tỷ lệ. */
function pmGroupChart(rows) {
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return `<div class="pm-hbar-list">${rows.map((row) => `<div class="pm-hbar"><span class="pm-hbar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span><span class="pm-hbar-track"><i style="width:${Math.round((row.amount / max) * 100)}%"></i></span><span class="pm-hbar-value tabular">${escapeHtml(pmFormatMoney(row.amount))}</span><span class="pm-hbar-count tabular">${row.count} CT</span></div>`).join("")}</div>`;
}

/** Top chương trình dùng nhiều. */
function pmTopChart(rows) {
  const max = Math.max(1, ...rows.map((row) => row.usedCount));
  return `<ol class="pm-top-list">${rows.map((row, index) => `<li><span class="pm-top-rank">${index + 1}</span><span class="pm-top-name"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.code)}</small></span><span class="pm-hbar-track"><i style="width:${Math.round((row.usedCount / max) * 100)}%"></i></span><span class="pm-top-count tabular">${row.usedCount} lượt</span></li>`).join("") || '<li class="pm-muted">Chưa có dữ liệu sử dụng.</li>'}</ol>`;
}

function pmDashboardScreen() {
  const catalog = pmCatalog();
  const store = pmStore();
  const stats = pmAggregates(catalog, store.promotions, store.vouchers, store.usage, pmUi.dash, pmToday());
  const filters = `
    <div class="pm-filters">
      <label class="field"><span>Từ ngày</span><input class="input" type="date" id="pm-dash-from" data-pm-dash="from" value="${escapeHtml(pmUi.dash.from)}" /></label>
      <label class="field"><span>Đến ngày</span><input class="input" type="date" id="pm-dash-to" data-pm-dash="to" value="${escapeHtml(pmUi.dash.to)}" /></label>
      <label class="field"><span>Chi nhánh</span><select class="input" id="pm-dash-branch" data-pm-dash="branch"><option value="">Toàn trung tâm</option>${catalog.branches.map((branch) => `<option value="${branch.id}" ${pmUi.dash.branch === branch.id ? "selected" : ""}>${escapeHtml(branch.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Nhóm khuyến mãi</span><select class="input" id="pm-dash-group" data-pm-dash="group"><option value="">Tất cả nhóm</option>${catalog.groups.map((group) => `<option value="${group.key}" ${pmUi.dash.group === group.key ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label>
      <button class="secondary-btn" type="button" data-pm-dash-reset>Xóa lọc</button>
    </div>`;
  return `
    <div class="pm-kpi-row">
      ${pmKpiTile("Số chương trình", stats.totals.programs, "theo bộ lọc hiện tại")}
      ${pmKpiTile("Đang hoạt động", stats.totals.active, "đang chạy trong kỳ")}
      ${pmKpiTile("Chờ phê duyệt", stats.totals.pending, "cần người duyệt")}
      ${pmKpiTile("Đã hết hạn", stats.totals.expired, "không còn áp dụng")}
      ${pmKpiTile("Tổng lượt sử dụng", stats.totals.usages, `${stats.totals.voucherUsed}/${stats.totals.vouchers} voucher đã dùng`)}
      ${pmKpiTile("Tổng giá trị giảm", pmFormatMoney(stats.totals.discount), "cộng dồn mọi chương trình")}
    </div>
    ${filters}
    <div class="pm-chart-grid">
      <section class="card pm-card"><div class="card-header pm-card-head"><div class="card-heading"><div><h2>Voucher phát hành theo tháng</h2><p>12 tháng gần nhất — tính theo ngày phát hành và ngày sử dụng.</p></div></div></div><div class="pm-card-body">${pmMonthChart(stats.voucherByMonth)}</div></section>
      <section class="card pm-card"><div class="card-header pm-card-head"><div class="card-heading"><div><h2>Giá trị giảm theo nhóm</h2><p>Tổng số tiền đã trợ giá của 5 nhóm nghiệp vụ.</p></div></div></div><div class="pm-card-body">${pmGroupChart(stats.byGroup)}</div></section>
      <section class="card pm-card pm-card-wide"><div class="card-header pm-card-head"><div class="card-heading"><div><h2>Top chương trình được dùng nhiều</h2><p>Xếp theo số lượt áp dụng thực tế.</p></div><button class="secondary-btn" type="button" data-pm-tab="list">Xem danh sách</button></div></div><div class="pm-card-body">${pmTopChart(stats.top)}</div></section>
    </div>`;
}

/* ------------------------------------------------------------------ Danh sách */

function pmListRows() {
  const catalog = pmCatalog();
  const filter = pmUi.list;
  const query = filter.q.trim().toLowerCase();
  let rows = pmStore().promotions.filter((promotion) => {
    if (filter.group && promotion.group !== filter.group) return false;
    if (filter.status && promotion.status !== filter.status) return false;
    if (filter.branch && !(promotion.branches || []).includes(filter.branch)) return false;
    if (!query) return true;
    return `${promotion.code} ${promotion.name} ${pmPromotionTypeName(catalog, promotion)} ${promotion.createdBy}`.toLowerCase().includes(query);
  });
  const sorters = {
    recent: (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    name: (a, b) => a.name.localeCompare(b.name, "vi"),
    usage: (a, b) => b.usedCount - a.usedCount,
    amount: (a, b) => b.usedAmount - a.usedAmount,
    end: (a, b) => String(a.endDate || "9999").localeCompare(String(b.endDate || "9999")),
  };
  rows = rows.slice().sort(sorters[filter.sort] || sorters.recent);
  return rows;
}

function pmPagination(total) {
  const pageSize = pmUi.list.pageSize;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pmUi.list.page > pages) pmUi.list.page = pages;
  const buttons = [];
  for (let page = 1; page <= pages; page += 1) {
    if (pages > 7 && page !== 1 && page !== pages && Math.abs(page - pmUi.list.page) > 2) {
      if (page === 2 || page === pages - 1) buttons.push('<span class="pm-page-gap">…</span>');
      continue;
    }
    buttons.push(`<button class="pm-page${page === pmUi.list.page ? " active" : ""}" type="button" data-pm-page="${page}">${page}</button>`);
  }
  return `<div class="pm-pager"><span>${total} bản ghi · trang ${pmUi.list.page}/${pages}</span><div class="pm-page-actions">${buttons.join("")}</div><select class="input pm-page-size" data-pm-page-size><option value="10" ${pageSize === 10 ? "selected" : ""}>10 / trang</option><option value="20" ${pageSize === 20 ? "selected" : ""}>20 / trang</option><option value="50" ${pageSize === 50 ? "selected" : ""}>50 / trang</option></select></div>`;
}

function pmListScreen() {
  const catalog = pmCatalog();
  const rows = pmListRows();
  const page = rows.slice((pmUi.list.page - 1) * pmUi.list.pageSize, pmUi.list.page * pmUi.list.pageSize);
  const body = page.map((promotion) => {
    const group = pmGroup(catalog, promotion.group);
    const active = promotion.status === "active";
    return `<tr data-pm-open="${promotion.id}">
      <td><strong>${escapeHtml(promotion.name)}</strong><span class="code">${escapeHtml(promotion.code)}</span></td>
      <td>${escapeHtml(group ? group.name : promotion.group)}</td>
      <td class="pm-muted">${escapeHtml(pmPromotionTypeName(catalog, promotion))}</td>
      <td>${pmMethodBadge(promotion)}</td>
      <td class="tabular">${promotion.minTuition ? pmFormatMoney(promotion.minTuition) : "—"}</td>
      <td class="tabular">${promotion.maxDiscount ? pmFormatMoney(promotion.maxDiscount) : "—"}</td>
      <td class="tabular">${pmFormatDate(promotion.startDate)}<span class="people-subline">→ ${promotion.endDate ? pmFormatDate(promotion.endDate) : "không hết hạn"}</span></td>
      <td class="tabular">${promotion.usedCount}${promotion.usageLimit ? ` / ${promotion.usageLimit}` : ""}<span class="people-subline">${pmFormatMoney(promotion.usedAmount)}</span></td>
      <td>${pmStatusBadge(promotion.status)}</td>
      <td class="settings-actions-cell" data-pm-noopen>
        <div class="row-actions settings-row-actions">
          <button class="mini-btn" title="Xem chi tiết" data-pm-detail="${promotion.id}">${icon("eye")}</button>
          <button class="mini-btn" title="Sửa" data-pm-edit="${promotion.id}">${icon("pencil")}</button>
          <button class="mini-btn" title="Nhân bản" data-pm-duplicate="${promotion.id}">${icon("clipboard")}</button>
          <button class="mini-btn" title="${active ? "Tắt chương trình" : "Kích hoạt"}" data-pm-toggle="${promotion.id}">${icon(active ? "lock" : "check")}</button>
          <button class="trash-btn" title="Xóa" data-pm-delete="${promotion.id}">${icon("trash")}</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  return `
    <section class="card settings-card people-card">
      <div class="card-header settings-card-header people-card-header">
        <div class="card-heading"><div><h2>Chương trình khuyến mãi (${rows.length})</h2><p>Dữ liệu mẫu phía giao diện — thêm, sửa, nhân bản, bật/tắt và xuất CSV ngay trên trình duyệt.</p></div>
          <div class="pm-head-actions"><button class="secondary-btn" type="button" data-pm-export-csv>${icon("download")}Xuất CSV</button><button class="primary-btn" type="button" data-pm-new>${icon("plus")}Thêm khuyến mãi</button></div>
        </div>
        <div class="people-filters pm-list-filters">
          <label class="field"><span>Tìm kiếm</span><input class="input" id="pm-list-q" data-pm-list="q" placeholder="Mã, tên, người tạo…" value="${escapeHtml(pmUi.list.q)}" /></label>
          <label class="field"><span>Nhóm</span><select class="input" data-pm-list="group"><option value="">Tất cả</option>${catalog.groups.map((group) => `<option value="${group.key}" ${pmUi.list.group === group.key ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Trạng thái</span><select class="input" data-pm-list="status"><option value="">Tất cả</option>${catalog.statuses.map((status) => `<option value="${status.key}" ${pmUi.list.status === status.key ? "selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Chi nhánh</span><select class="input" data-pm-list="branch"><option value="">Tất cả</option>${catalog.branches.map((branch) => `<option value="${branch.id}" ${pmUi.list.branch === branch.id ? "selected" : ""}>${escapeHtml(branch.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Sắp xếp</span><select class="input" data-pm-list="sort"><option value="recent" ${pmUi.list.sort === "recent" ? "selected" : ""}>Mới tạo nhất</option><option value="name" ${pmUi.list.sort === "name" ? "selected" : ""}>Tên A→Z</option><option value="usage" ${pmUi.list.sort === "usage" ? "selected" : ""}>Lượt dùng giảm dần</option><option value="amount" ${pmUi.list.sort === "amount" ? "selected" : ""}>Giá trị giảm giảm dần</option><option value="end" ${pmUi.list.sort === "end" ? "selected" : ""}>Hết hạn gần nhất</option></select></label>
        </div>
      </div>
      <div class="table-wrap pm-table-scroll" data-pm-scroll>
        <table class="pm-list-table">
          <thead><tr><th>Chương trình</th><th>Nhóm</th><th>Loại</th><th>Mức giảm</th><th>Học phí tối thiểu</th><th>Trần giảm</th><th>Hiệu lực</th><th>Đã dùng</th><th>Trạng thái</th><th class="settings-actions-cell">Thao tác</th></tr></thead>
          <tbody>${body || '<tr><td class="empty-cell" colspan="10">Không có chương trình nào khớp bộ lọc.</td></tr>'}</tbody>
        </table>
      </div>
      ${pmPagination(rows.length)}
    </section>`;
}

/* ------------------------------------------------------------------ Form 7 tab */

function pmFormScreen() {
  const catalog = pmCatalog();
  const draft = pmUi.draft;
  const editing = Boolean(draft.id);
  const tab = PM_FORM_TABS.find((item) => item.key === pmUi.draftTab) || PM_FORM_TABS[0];
  const yesNo = (name, label, value, hint) => `<label class="field"><span>${label}</span><div class="pm-switch-row"><select class="input" data-pm-input="${name}"><option value="false" ${value ? "" : "selected"}>Không</option><option value="true" ${value ? "selected" : ""}>Có</option></select>${hint ? `<small>${hint}</small>` : ""}</div></label>`;

  let panel = "";
  if (tab.key === "general") {
    panel = `<div class="form-grid">
      <label class="field span-2"><span>Tên chương trình</span><input class="input" data-pm-input="name" value="${escapeHtml(draft.name)}" placeholder="Ví dụ: Đăng ký sớm khóa 12/2026" /></label>
      <label class="field"><span>Mã chương trình</span><input class="input" data-pm-input="code" value="${escapeHtml(draft.code)}" placeholder="EARLYBIRD15" /></label>
      <label class="field"><span>Trạng thái</span><select class="input" data-pm-input="status">${catalog.statuses.map((status) => `<option value="${status.key}" ${draft.status === status.key ? "selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Nhóm nghiệp vụ</span><select class="input" data-pm-group="group">${catalog.groups.map((group) => `<option value="${group.key}" ${draft.group === group.key ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Loại chương trình</span><select class="input" data-pm-type="type">${(pmGroup(catalog, draft.group)?.types || []).map((type) => `<option value="${type.key}" ${draft.type === type.key ? "selected" : ""}>${escapeHtml(type.name)}</option>`).join("")}</select></label>
      <label class="field span-2"><span>Mô tả / ghi chú</span><textarea class="input textarea" data-pm-input="note" rows="3" placeholder="Ghi chú nghiệp vụ, căn cứ phê duyệt…">${escapeHtml(draft.note)}</textarea></label>
    </div>`;
  } else if (tab.key === "conditions") {
    panel = `<div class="form-grid">
      <label class="field"><span>Ngày bắt đầu</span><input class="input" type="date" data-pm-input="startDate" value="${escapeHtml(draft.startDate)}" /></label>
      <label class="field"><span>Ngày kết thúc</span><input class="input" type="date" data-pm-input="endDate" value="${escapeHtml(draft.endDate)}" /></label>
      <div class="field span-2"><span>Chi nhánh áp dụng</span>${pmCheckGrid("branches", catalog.branches, draft.branches, 2)}<small>Không chọn chi nhánh nào = áp dụng toàn trung tâm.</small></div>
      ${pmTypeFields(catalog, draft)}
    </div>`;
  } else if (tab.key === "discount") {
    panel = `<div class="form-grid">
      <label class="field"><span>Phương thức giảm</span><select class="input" data-pm-method="method">${catalog.methods.map((method) => `<option value="${method.key}" ${draft.method === method.key ? "selected" : ""}>${escapeHtml(method.name)}</option>`).join("")}</select></label>
      ${pmNumberField("Giá trị giảm", "value", draft.value, 'min="0" step="0.5"', draft.method === "percent" ? "Nhập % (ví dụ 15 = giảm 15%)." : draft.method === "amount" ? "Số tiền giảm tuyệt đối." : "Số khóa/buổi được tặng.")}
      ${pmNumberField("Mức giảm tối đa (đ)", "maxDiscount", draft.maxDiscount, 'min="0" step="100000"', "0 = không trần.")}
      ${pmNumberField("Học phí tối thiểu (đ)", "minTuition", draft.minTuition, 'min="0" step="100000"')}
      ${yesNo("stackable", "Được cộng gộp với chương trình khác", draft.stackable, "Cộng gộp chỉ áp dụng giữa các chương trình cùng đánh dấu này.")}
    </div>`;
  } else if (tab.key === "students") {
    panel = `<div class="field span-2"><span>Thẻ học viên đủ điều kiện</span>${pmCheckGrid("tags", catalog.studentTags, draft.tags, 3)}<small>Không chọn thẻ nào = mọi học viên.</small></div>
      <p class="pm-muted">Khi mô phỏng, một chương trình chỉ đủ điều kiện nếu học viên mang ít nhất một thẻ được chọn.</p>`;
  } else if (tab.key === "courses") {
    panel = `<div class="field span-2"><span>Khóa học áp dụng</span>${pmCheckGrid("courses", catalog.courses, draft.courses, 3)}<small>Không chọn khóa nào = áp dụng cho mọi khóa.</small></div>`;
  } else if (tab.key === "limits") {
    panel = `<div class="form-grid">
      ${pmNumberField("Tổng lượt sử dụng", "usageLimit", draft.usageLimit, 'min="0"', "0 = không giới hạn.")}
      ${pmNumberField("Số lượt tối đa / học viên", "usagePerStudent", draft.usagePerStudent, 'min="0"')}
      ${pmNumberField("Đã sử dụng", "usedCount", draft.usedCount, 'min="0"', "Chỉ số liệu mẫu, dùng cho biểu đồ.")}
      ${pmNumberField("Tổng giá trị đã giảm (đ)", "usedAmount", draft.usedAmount, 'min="0" step="100000"')}
    </div>`;
  } else {
    panel = `<div class="form-grid">
      ${yesNo("approvalRequired", "Cần phê duyệt trước khi áp dụng", draft.approvalRequired, "Hồ sơ sẽ xuất hiện ở tab Duyệt học bổng.")}
      <label class="field"><span>Người phê duyệt</span><select class="input" data-pm-extra="approver">${catalog.approvers.map((name) => `<option value="${escapeHtml(name)}" ${(draft.extra || {}).approver === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
      <label class="field"><span>Người tạo</span><input class="input" data-pm-input="createdBy" value="${escapeHtml(draft.createdBy)}" /></label>
      <label class="field"><span>Ngày tạo</span><input class="input" type="date" data-pm-input="createdAt" value="${escapeHtml(draft.createdAt)}" /></label>
      <div class="pm-permission-note span-2">Phân quyền theo vai trò hiện có của hệ thống: Quản trị và Kế toán trưởng được tạo/sửa; Kế toán viên chỉ xem và mô phỏng. Module này không thay đổi quyền thật của ứng dụng.</div>
    </div>`;
  }

  return `
    <button class="back-link" data-pm-back-list>← Quay lại danh sách</button>
    <section class="card settings-card">
      <div class="card-header settings-card-header">
        <div class="card-heading"><div><h2>${editing ? "Sửa khuyến mãi" : "Thêm khuyến mãi"}</h2><p>${escapeHtml(draft.name || "Chưa đặt tên")}${editing ? ` · ${escapeHtml(draft.code)}` : ""}</p></div>
        <div class="pm-head-actions">${pmStatusBadge(draft.status)}${pmMethodBadge(draft)}</div></div>
      </div>
      <nav class="pm-form-tabs">${PM_FORM_TABS.map((item, index) => `<button class="pm-form-tab${item.key === tab.key ? " active" : ""}" type="button" data-pm-form-tab="${item.key}">${index + 1}. ${item.name}</button>`).join("")}</nav>
      <div class="pm-form-panel">${panel}</div>
      <div class="settings-modal-footer">
        <button class="secondary-btn" type="button" data-pm-back-list>Hủy</button>
        <button class="primary-btn" type="button" data-pm-save>${icon("check")}${editing ? "Lưu thay đổi" : "Tạo chương trình"}</button>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ Chi tiết */

function pmDetailScreen() {
  const catalog = pmCatalog();
  const promotion = pmPromotionById(pmUi.detailId);
  if (!promotion) return `<div class="empty-state"><h1>Không tìm thấy chương trình</h1><button class="primary-btn" data-pm-back-list>Về danh sách</button></div>`;
  const group = pmGroup(catalog, promotion.group);
  const vouchers = pmStore().vouchers.filter((voucher) => voucher.promotionId === promotion.id);
  const usage = pmStore().usage.filter((row) => row.promotionId === promotion.id);
  const extra = Object.entries(promotion.extra || {});
  const row = (label, value) => `<div class="pm-info-row"><span>${label}</span><strong>${value || "—"}</strong></div>`;
  const usageRows = usage.map((item) => `<tr><td class="tabular">${pmFormatDate(item.date)}</td><td>${escapeHtml(item.student)}</td><td>${escapeHtml(pmCourseName(item.course))}</td><td>${escapeHtml(pmBranchName(item.branch))}</td><td class="tabular">${pmFormatMoney(item.amount)}</td><td>${escapeHtml(item.channel || "—")}</td></tr>`).join("");

  return `
    <button class="back-link" data-pm-back-list>← Quay lại danh sách</button>
    <div class="pm-detail-head">
      <div><h1>${escapeHtml(promotion.name)}</h1><p><span class="code">${escapeHtml(promotion.code)}</span> · ${escapeHtml(group ? group.name : "")} · ${escapeHtml(pmPromotionTypeName(catalog, promotion))}</p></div>
      <div class="pm-head-actions">${pmStatusBadge(promotion.status)}
        <button class="secondary-btn" type="button" data-pm-edit="${promotion.id}">${icon("pencil")}Sửa</button>
        <button class="secondary-btn" type="button" data-pm-duplicate="${promotion.id}">${icon("clipboard")}Nhân bản</button>
        <button class="primary-btn" type="button" data-pm-toggle="${promotion.id}">${promotion.status === "active" ? "Tắt chương trình" : "Kích hoạt"}</button>
      </div>
    </div>
    <div class="pm-detail-grid">
      <div class="pm-detail-col">
        <section class="card settings-card"><div class="card-header settings-card-header"><div class="card-heading"><div><h2>Thông tin áp dụng</h2><p>Hiệu lực, phạm vi và cấu hình giảm giá.</p></div></div></div>
          <div class="pm-card-body">
            ${row("Phương thức giảm", `${pmMethodName(catalog, promotion.method)} · ${promotion.method === "percent" ? `${promotion.value}%` : pmFormatMoney(promotion.value)}`)}
            ${row("Mức giảm tối đa", promotion.maxDiscount ? pmFormatMoney(promotion.maxDiscount) : "Không giới hạn")}
            ${row("Học phí tối thiểu", promotion.minTuition ? pmFormatMoney(promotion.minTuition) : "Không yêu cầu")}
            ${row("Hiệu lực", `${pmFormatDate(promotion.startDate)} → ${promotion.endDate ? pmFormatDate(promotion.endDate) : "không hết hạn"}`)}
            ${row("Chi nhánh", (promotion.branches || []).length ? promotion.branches.map(pmBranchName).join(", ") : "Toàn trung tâm")}
            ${row("Khóa học", (promotion.courses || []).length ? promotion.courses.map(pmCourseName).join(", ") : "Mọi khóa")}
            ${row("Thẻ học viên", (promotion.tags || []).length ? promotion.tags.map(pmTagName).join(", ") : "Mọi học viên")}
            ${row("Cộng gộp", promotion.stackable ? "Được cộng gộp" : "Chỉ dùng một chương trình")}
            ${row("Phê duyệt", promotion.approvalRequired ? `Bắt buộc · ${(promotion.extra || {}).approver || "Chưa chỉ định người duyệt"}` : "Không cần")}
            ${row("Giới hạn", `${promotion.usageLimit || "∞"} lượt toàn trung tâm · ${promotion.usagePerStudent || "∞"} lượt / học viên`)}
            ${extra.filter(([key]) => key !== "approver").length ? `<div class="pm-extra">${extra.filter(([key, value]) => key !== "approver" && value !== "" && value !== null && value !== undefined).map(([key, value]) => row(escapeHtml(pmPromotionExtraLabel(key)), escapeHtml(value === true ? "Có" : value === false ? "Không" : String(value))))}</div>` : ""}
            ${promotion.note ? `<p class="pm-note">${escapeHtml(promotion.note)}</p>` : ""}
          </div>
        </section>
      </div>
      <div class="pm-detail-col">
        <section class="card settings-card"><div class="card-header settings-card-header"><div class="card-heading"><div><h2>Voucher của chương trình (${vouchers.length})</h2><p>${vouchers.filter((voucher) => voucher.status === "used").length} đã dùng · ${vouchers.filter((voucher) => voucher.status === "unused").length} còn hiệu lực.</p></div><button class="secondary-btn" type="button" data-pm-generate="${promotion.id}">${icon("key")}Sinh mã</button></div></div>
          <div class="table-wrap"><table><thead><tr><th>Mã</th><th>Trạng thái</th><th>Ngày dùng</th></tr></thead><tbody>${vouchers.map((voucher) => `<tr><td><span class="code">${escapeHtml(voucher.code)}</span></td><td>${pmVoucherBadge(voucher.status)}</td><td class="tabular">${voucher.usedAt ? pmFormatDate(voucher.usedAt) : "—"}</td></tr>`).join("") || '<tr><td class="empty-cell" colspan="3">Chưa phát hành mã nào.</td></tr>'}</tbody></table></div>
        </section>
        <section class="card settings-card"><div class="card-header settings-card-header"><div class="card-heading"><div><h2>Lượt sử dụng gần đây (${usage.length})</h2><p>Tổng giá trị đã giảm ${pmFormatMoney(promotion.usedAmount)}.</p></div></div></div>
          <div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Học viên</th><th>Khóa</th><th>Chi nhánh</th><th>Giảm</th><th>Kênh</th></tr></thead><tbody>${usageRows || '<tr><td class="empty-cell" colspan="6">Chưa có lượt sử dụng.</td></tr>'}</tbody></table></div>
        </section>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ Voucher */

function pmVoucherBadge(status) {
  const meta = (pmCatalog().voucherStatus || []).find((item) => item.key === status) || { name: status, badge: "slate" };
  return `<span class="badge badge-${meta.badge}">${escapeHtml(meta.name)}</span>`;
}

/** Badge cho hồ sơ học bổng (khoá trạng thái khác với chương trình). */
function pmApprovalBadge(status) {
  const meta = { pending: { name: "Chờ duyệt", badge: "amber" }, approved: { name: "Đã duyệt", badge: "green" }, rejected: { name: "Từ chối", badge: "red" } }[status] || { name: status, badge: "slate" };
  return `<span class="badge badge-${meta.badge}">${escapeHtml(meta.name)}</span>`;
}

function pmVoucherRows() {
  const filter = pmUi.vouchers;
  const query = filter.q.trim().toLowerCase();
  return pmStore().vouchers.filter((voucher) => {
    if (filter.status && voucher.status !== filter.status) return false;
    if (filter.promotion && voucher.promotionId !== filter.promotion) return false;
    if (!query) return true;
    return `${voucher.code} ${voucher.holder}`.toLowerCase().includes(query);
  });
}

function pmVouchersScreen() {
  const catalog = pmCatalog();
  const rows = pmVoucherRows();
  const total = pmStore().vouchers.length;
  const byStatus = (status) => pmStore().vouchers.filter((voucher) => voucher.status === status).length;
  return `
    <section class="card settings-card people-card">
      <div class="card-header settings-card-header people-card-header">
        <div class="card-heading"><div><h2>Quản lý voucher (${total})</h2><p>${byStatus("unused")} chưa dùng · ${byStatus("used")} đã dùng · ${byStatus("expired")} hết hạn.</p></div>
          <div class="pm-head-actions"><button class="secondary-btn" type="button" data-pm-export-vouchers>${icon("download")}Xuất CSV</button><button class="primary-btn" type="button" data-pm-generate="">${icon("plus")}Sinh mã voucher</button></div></div>
        <div class="people-filters">
          <label class="field"><span>Tìm mã / người giữ</span><input class="input" id="pm-voucher-q" data-pm-voucher="q" value="${escapeHtml(pmUi.vouchers.q)}" placeholder="NEWSTU-4821…" /></label>
          <label class="field"><span>Trạng thái</span><select class="input" data-pm-voucher="status"><option value="">Tất cả</option>${catalog.voucherStatus.map((status) => `<option value="${status.key}" ${pmUi.vouchers.status === status.key ? "selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Chương trình</span><select class="input" data-pm-voucher="promotion"><option value="">Tất cả</option>${pmStore().promotions.map((promotion) => `<option value="${promotion.id}" ${pmUi.vouchers.promotion === promotion.id ? "selected" : ""}>${escapeHtml(promotion.code)}</option>`).join("")}</select></label>
        </div>
      </div>
      <div class="table-wrap"><table class="pm-list-table">
        <thead><tr><th>Mã voucher</th><th>Chương trình</th><th>Người giữ</th><th>Phát hành</th><th>Sử dụng</th><th>Giá trị giảm</th><th>Trạng thái</th><th class="settings-actions-cell">Thao tác</th></tr></thead>
        <tbody>${rows.map((voucher) => {
    const promotion = pmPromotionById(voucher.promotionId);
    return `<tr>
          <td><span class="code">${escapeHtml(voucher.code)}</span></td>
          <td>${promotion ? `<button class="pm-link" data-pm-detail="${promotion.id}">${escapeHtml(promotion.name)}</button>` : "—"}</td>
          <td>${escapeHtml(voucher.holder || "—")}<span class="people-subline">${voucher.holder ? "" : "Chưa gán học viên"}</span></td>
          <td class="tabular">${pmFormatDate(voucher.issuedAt)}</td>
          <td class="tabular">${voucher.usedAt ? pmFormatDate(voucher.usedAt) : "—"}</td>
          <td class="tabular">${voucher.amount ? pmFormatMoney(voucher.amount) : "—"}</td>
          <td>${pmVoucherBadge(voucher.status)}</td>
          <td class="settings-actions-cell"><div class="row-actions settings-row-actions">
            <button class="mini-btn" title="Gán người giữ" data-pm-assign="${voucher.id}">${icon("user")}</button>
            <button class="mini-btn" title="${voucher.status === "used" ? "Hoàn lại lượt dùng" : "Đánh dấu đã dùng"}" data-pm-use="${voucher.id}">${icon(voucher.status === "used" ? "undo" : "check")}</button>
            <button class="trash-btn" title="Xóa mã" data-pm-delete-voucher="${voucher.id}">${icon("trash")}</button>
          </div></td>
        </tr>`;
  }).join("") || '<tr><td class="empty-cell" colspan="8">Không có voucher nào khớp bộ lọc.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

/* ------------------------------------------------------------------ Duyệt học bổng */

function pmApprovalsScreen() {
  const store = pmStore();
  const rows = store.scholarships.filter((row) => !pmUi.approvals.status || row.status === pmUi.approvals.status);
  const pending = store.scholarships.filter((row) => row.status === "pending").length;
  return `
    <section class="card settings-card people-card">
      <div class="card-header settings-card-header people-card-header">
        <div class="card-heading"><div><h2>Hồ sơ học bổng (${store.scholarships.length})</h2><p>${pending} hồ sơ đang chờ duyệt. Phê duyệt chỉ ghi nhận trên dữ liệu mẫu của module.</p></div>
          <div class="pm-head-actions"><select class="input pm-page-size" data-pm-approval="status"><option value="pending" ${pmUi.approvals.status === "pending" ? "selected" : ""}>Chỉ chờ duyệt</option><option value="" ${pmUi.approvals.status === "" ? "selected" : ""}>Tất cả hồ sơ</option><option value="approved" ${pmUi.approvals.status === "approved" ? "selected" : ""}>Đã duyệt</option><option value="rejected" ${pmUi.approvals.status === "rejected" ? "selected" : ""}>Đã từ chối</option></select></div></div>
      </div>
      <div class="table-wrap"><table class="pm-list-table">
        <thead><tr><th>Học viên</th><th>Chương trình</th><th>Số tiền xin xét</th><th>Lý do</th><th>Người nộp</th><th>Ngày nộp</th><th>Người duyệt</th><th>Trạng thái</th><th class="settings-actions-cell">Thao tác</th></tr></thead>
        <tbody>${rows.map((row) => {
    const promotion = pmPromotionById(row.promotion);
    return `<tr>
          <td><strong>${escapeHtml(row.student)}</strong><span class="people-subline">${escapeHtml(row.studentCode)} · ${escapeHtml(pmBranchName(row.branch))}</span></td>
          <td>${promotion ? escapeHtml(promotion.name) : "—"}<span class="people-subline">${escapeHtml(pmCourseName(row.course))}</span></td>
          <td class="tabular">${pmFormatMoney(row.requestedAmount)}</td>
          <td>${escapeHtml(row.reason)}</td>
          <td>${escapeHtml(row.applicant)}</td>
          <td class="tabular">${pmFormatDate(row.submittedAt)}</td>
          <td>${escapeHtml(row.approver || (promotion?.extra || {}).approver || "—")}</td>
          <td>${pmApprovalBadge(row.status)}</td>
          <td class="settings-actions-cell"><div class="row-actions settings-row-actions">
            ${row.status === "pending" ? `<button class="mini-btn" title="Duyệt hồ sơ" data-pm-approve="${row.id}">${icon("check")}</button><button class="mini-btn pm-reject-btn" title="Từ chối" data-pm-reject="${row.id}">×</button>` : `<span class="pm-muted">${row.decidedAt ? pmFormatDate(row.decidedAt) : "Đã xử lý"}</span>`}
          </div></td>
        </tr>`;
  }).join("") || '<tr><td class="empty-cell" colspan="9">Không có hồ sơ nào.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

/* ------------------------------------------------------------------ Lịch sử */

function pmHistoryRows() {
  const filter = pmUi.history;
  const query = filter.q.trim().toLowerCase();
  return pmStore().usage
    .filter((row) => {
      const promotion = pmPromotionById(row.promotionId);
      if (filter.group && (!promotion || promotion.group !== filter.group)) return false;
      if (filter.from && row.date < filter.from) return false;
      if (filter.to && row.date > filter.to) return false;
      if (!query) return true;
      return `${row.student} ${promotion?.code || ""} ${promotion?.name || ""} ${pmCourseName(row.course)}`.toLowerCase().includes(query);
    })
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function pmHistoryScreen() {
  const catalog = pmCatalog();
  const rows = pmHistoryRows();
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return `
    <section class="card settings-card people-card">
      <div class="card-header settings-card-header people-card-header">
        <div class="card-heading"><div><h2>Lịch sử sử dụng (${rows.length})</h2><p>Tổng giá trị đã giảm trong bộ lọc: ${pmFormatMoney(total)}.</p></div>
          <button class="secondary-btn" type="button" data-pm-export-usage>${icon("download")}Xuất CSV</button></div>
        <div class="people-filters">
          <label class="field"><span>Tìm kiếm</span><input class="input" id="pm-history-q" data-pm-history="q" value="${escapeHtml(pmUi.history.q)}" placeholder="Tên học viên, mã chương trình…" /></label>
          <label class="field"><span>Nhóm</span><select class="input" data-pm-history="group"><option value="">Tất cả</option>${catalog.groups.map((group) => `<option value="${group.key}" ${pmUi.history.group === group.key ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Từ ngày</span><input class="input" type="date" data-pm-history="from" value="${escapeHtml(pmUi.history.from)}" /></label>
          <label class="field"><span>Đến ngày</span><input class="input" type="date" data-pm-history="to" value="${escapeHtml(pmUi.history.to)}" /></label>
        </div>
      </div>
      <div class="table-wrap"><table class="pm-list-table">
        <thead><tr><th>Ngày</th><th>Học viên</th><th>Chương trình</th><th>Khóa học</th><th>Chi nhánh</th><th>Kênh thu</th><th>Số tiền giảm</th></tr></thead>
        <tbody>${rows.map((row) => {
    const promotion = pmPromotionById(row.promotionId);
    return `<tr><td class="tabular">${pmFormatDate(row.date)}</td><td><strong>${escapeHtml(row.student)}</strong></td>
      <td>${promotion ? `<button class="pm-link" data-pm-detail="${promotion.id}">${escapeHtml(promotion.name)}</button><span class="people-subline">${escapeHtml(promotion.code)}</span>` : "—"}</td>
      <td>${escapeHtml(pmCourseName(row.course))}</td><td>${escapeHtml(pmBranchName(row.branch))}</td><td>${escapeHtml(row.channel || "—")}</td>
      <td class="tabular">${pmFormatMoney(row.amount)}</td></tr>`;
  }).join("") || '<tr><td class="empty-cell" colspan="7">Chưa có lượt sử dụng nào khớp bộ lọc.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

/* ------------------------------------------------------------------ Mô phỏng */

function pmSimCourses() {
  const catalog = pmCatalog();
  return pmUi.sim.courses.map((id) => catalog.courses.find((course) => course.id === id)).filter(Boolean).map((course) => ({ ...course }));
}

function pmSimulatorScreen() {
  const catalog = pmCatalog();
  const store = pmStore();
  const sim = pmUi.sim;
  const student = catalog.students.find((item) => item.id === sim.studentId) || null;
  const ctx = {
    date: sim.date || pmToday(),
    branch: sim.branch,
    student,
    courses: pmSimCourses(),
    groupSize: Number(sim.groupSize) || 1,
    prepayMonths: Number(sim.prepayMonths) || 0,
    usedByStudent: 0,
  };
  const result = pmSimulate(ctx, catalog, store.promotions, store.vouchers);
  const chosen = sim.choice === "" ? null : result.options[Number(sim.choice)] || null;
  const amount = chosen ? chosen.amount : 0;
  const payable = pmPayable(result.total, amount);

  const courseBoxes = catalog.courses.map((course) => `<label class="pm-check pm-check-3"><input type="checkbox" value="${escapeHtml(course.id)}" data-pm-sim-course="${course.id}" ${sim.courses.includes(course.id) ? "checked " : ""} /><span>${escapeHtml(course.name)} <em class="tabular">${pmFormatMoney(course.tuition)}</em></span></label>`).join("");

  return `
    <div class="pm-sim-grid">
      <section class="card settings-card"><div class="card-header settings-card-header"><div class="card-heading"><div><h2>Thông tin tính thử</h2><p>Chọn học viên, chi nhánh và số khóa để hệ thống liệt kê chương trình đủ điều kiện.</p></div></div></div>
        <div class="pm-card-body pm-sim-form">
          <div class="form-grid">
            <label class="field"><span>Học viên</span><select class="input" id="pm-sim-student" data-pm-sim="studentId"><option value="">— Chưa chọn —</option>${catalog.students.map((item) => `<option value="${item.id}" ${sim.studentId === item.id ? "selected" : ""}>${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`).join("")}</select></label>
            <label class="field"><span>Chi nhánh</span><select class="input" data-pm-sim="branch">${catalog.branches.map((branch) => `<option value="${branch.id}" ${sim.branch === branch.id ? "selected" : ""}>${escapeHtml(branch.name)}</option>`).join("")}</select></label>
            <label class="field"><span>Ngày đóng phí</span><input class="input" type="date" data-pm-sim="date" value="${escapeHtml(sim.date || pmToday())}" /></label>
            <label class="field"><span>Số học viên đăng ký cùng nhau</span><input class="input tabular" type="number" min="1" max="20" data-pm-sim="groupSize" value="${escapeHtml(sim.groupSize)}" /></label>
            <label class="field"><span>Số tháng đóng trước</span><input class="input tabular" type="number" min="0" max="24" data-pm-sim="prepayMonths" value="${escapeHtml(sim.prepayMonths)}" /></label>
          </div>
          <div class="field"><span>Khóa học đăng ký</span><div class="pm-check-grid">${courseBoxes}</div></div>
        </div>
      </section>
      <section class="card settings-card"><div class="card-header settings-card-header"><div class="card-heading"><div><h2>Chương trình đủ điều kiện (${result.eligible.length})</h2><p>Số tiền giảm tính theo học phí đã chọn, có áp mức giảm tối đa.</p></div></div></div>
        <div class="table-wrap"><table><thead><tr><th>Chọn</th><th>Chương trình</th><th>Cách tính</th><th>Số tiền giảm</th></tr></thead>
          <tbody>${result.options.length ? result.options.map((option, index) => `<tr class="${String(index) === String(sim.choice) ? "pm-row-chosen" : ""}"><td><input type="radio" name="pm-sim-choice" data-pm-sim-choice="${index}" ${String(index) === String(sim.choice) ? "checked " : ""} /></td>
            <td><strong>${escapeHtml(option.label)}</strong><span class="people-subline">${escapeHtml(option.kind === "combo" ? `Cộng gộp ${option.rows.length} chương trình` : option.kind === "voucher" ? "Voucher" : "Một chương trình")} · ${escapeHtml(option.detail)}</span></td>
            <td class="pm-muted">${escapeHtml(option.rows.map((row) => row.detail).filter(Boolean).join(" + ") || "—")}</td>
            <td class="tabular">${pmFormatMoney(option.amount)}</td></tr>`).join("") : '<tr><td class="empty-cell" colspan="4">Chưa có phương án nào đủ điều kiện. Chọn thêm khóa học hoặc đổi ngày đóng phí.</td></tr>'}
            ${result.options.length ? `<tr><td><input type="radio" name="pm-sim-choice" data-pm-sim-choice="-1" ${String(sim.choice) === "-1" ? "checked " : ""} /></td><td colspan="2">Không dùng khuyến mãi</td><td class="tabular">0 ₫</td></tr>` : ""}</tbody>
        </table></div>
        ${result.excluded.length ? `<details class="pm-details"><summary>Vì sao ${result.excluded.length} chương trình khác không đủ điều kiện</summary><ul class="pm-blocks">${result.excluded.slice(0, 12).map((row) => `<li><strong>${escapeHtml(row.promotion.name)}</strong><span>${escapeHtml(row.check.blocks.join(" · "))}</span></li>`).join("")}</ul></details>` : ""}
      </section>
    </div>
    <section class="card settings-card pm-slip">
      <div class="card-header settings-card-header"><div class="card-heading"><div><h2>Kết quả giảm giá</h2><p>${chosen ? `Đang áp dụng: ${escapeHtml(chosen.label)}` : "Chọn một phương án ở danh sách trên để xem học phí sau giảm."}</p></div></div></div>
      <div class="pm-slip-grid">
        <div class="pm-slip-rows">
          <div class="pm-slip-row"><span>Tổng học phí (${ctx.courses.length} khóa)</span><strong class="tabular">${pmFormatMoney(result.total)}</strong></div>
          <div class="pm-slip-row"><span>Số tiền giảm</span><strong class="tabular pm-minus">− ${pmFormatMoney(amount)}</strong></div>
          <div class="pm-slip-row pm-slip-total"><span>Học phí phải thu</span><strong class="tabular">${pmFormatMoney(payable)}</strong></div>
        </div>
        <div class="pm-compare">
          <h3>So sánh phương án</h3>
          <table><thead><tr><th>#</th><th>Phương án</th><th>Giảm</th><th>Còn lại</th></tr></thead><tbody>
            ${result.options.slice(0, 5).map((option, index) => `<tr class="${index === 0 ? "pm-best" : ""}"><td class="cell-index">${index + 1}</td><td>${escapeHtml(option.label)}</td><td class="tabular">${pmFormatMoney(option.amount)}</td><td class="tabular">${pmFormatMoney(option.payable)}</td></tr>`).join("") || '<tr><td class="empty-cell" colspan="4">Chưa có phương án.</td></tr>'}
          </tbody></table>
          <p class="pm-muted">Số liệu mô phỏng trên dữ liệu mẫu, không ghi vào học phí thật của lớp.</p>
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ Popup xác nhận */

function pmModalHtml() {
  const modal = pmUi.modal;
  if (!modal) return "";
  let inner = "";
  if (modal.kind === "delete") {
    const promotion = pmPromotionById(modal.id);
    inner = `<p>Bạn sắp xóa <strong>${escapeHtml(promotion?.name || "")}</strong> cùng toàn bộ voucher và lịch sử dùng của chương trình này. Thao tác chỉ ảnh hưởng dữ liệu mẫu trong trình duyệt.</p>`;
  } else if (modal.kind === "generate") {
    const catalog = pmCatalog();
    const promotions = pmStore().promotions;
    const selected = promotions.find((item) => item.id === modal.promotionId) || promotions[0];
    inner = `<div class="form-grid">
      <label class="field span-2"><span>Chương trình</span><select class="input" data-pm-gen="promotion">${promotions.map((item) => `<option value="${item.id}" ${selected?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`).join("")}</select></label>
      <label class="field"><span>Đầu mã</span><input class="input" data-pm-gen="prefix" value="${escapeHtml(modal.prefix || (selected?.code || "VOUCHER").replace(/[^A-Z0-9]/g, "").slice(0, 8))}" /></label>
      <label class="field"><span>Số lượng</span><input class="input tabular" type="number" min="1" max="200" data-pm-gen="count" value="${escapeHtml(modal.count || 5)}" /></label>
    </div><p class="pm-muted">Mã sinh ra chỉ lưu ở localStorage để demo luồng phát hành voucher.</p>`;
  } else if (modal.kind === "assign") {
    const voucher = pmStore().vouchers.find((item) => item.id === modal.id);
    inner = `<p>Gán mã <strong>${escapeHtml(voucher?.code || "")}</strong> cho một học viên.</p><label class="field"><span>Người giữ mã</span><input class="input" id="pm-assign-holder" data-pm-assign-holder value="${escapeHtml(voucher?.holder || "")}" placeholder="Nguyễn Văn A" /></label>`;
  } else if (modal.kind === "decide") {
    const row = pmStore().scholarships.find((item) => item.id === modal.id);
    const label = modal.decision === "approved" ? "Duyệt hồ sơ" : "Từ chối hồ sơ";
    inner = `<p>${label}: <strong>${escapeHtml(row?.student || "")}</strong> — ${pmFormatMoney(row?.requestedAmount || 0)} cho khóa ${escapeHtml(pmCourseName(row?.course))}.</p><label class="field"><span>Ghi chú${modal.decision === "approved" ? " (bắt buộc ghi căn cứ)" : ""}</span><textarea class="input textarea" id="pm-decide-note" data-pm-decide-note rows="3" placeholder="VD: Đã có biên bản họp hội đồng ngày…"></textarea></label>`;
  } else if (modal.kind === "reset") {
    inner = "<p>Đưa toàn bộ dữ liệu khuyến mãi về trạng thái dữ liệu mẫu ban đầu? Mọi chỉnh sửa trong trình duyệt này sẽ mất.</p>";
  }
  return `<div class="modal-backdrop" data-pm-close-modal><div class="modal-card" data-pm-modal-card><div class="modal-head"><div><h2>${escapeHtml(modal.title)}</h2><p>Module khuyến mãi — dữ liệu mẫu phía giao diện.</p></div><button class="close-btn" type="button" data-pm-close-modal>×</button></div><div class="pm-modal-body">${inner}</div><div class="settings-modal-footer"><button class="secondary-btn" type="button" data-pm-close-modal>Hủy</button><button class="primary-btn" type="button" data-pm-modal-ok>${modal.okLabel || "Xác nhận"}</button></div></div></div>`;
}

/* ------------------------------------------------------------------ Khung trang */

/** Toàn bộ nội dung tab Khuyến mãi (đầu trang + sub-nav + màn hình đang mở). */
function promotionBody() {
  const store = pmStore();
  const screen = pmUi.view === "form" ? pmFormScreen() : pmUi.view === "detail" ? pmDetailScreen() : pmUi.tab === "dashboard" ? pmDashboardScreen() : pmUi.tab === "list" ? pmListScreen() : pmUi.tab === "vouchers" ? pmVouchersScreen() : pmUi.tab === "approvals" ? pmApprovalsScreen() : pmUi.tab === "history" ? pmHistoryScreen() : pmSimulatorScreen();
  const pendingApprovals = store.scholarships.filter((row) => row.status === "pending").length;
  return `
    <div class="pm-header">
      <div><h1>Cấu hình khuyến mãi</h1><p>Quản lý chương trình khuyến mãi, voucher và học bổng. Bản giao diện chức năng — dữ liệu là mẫu, không ghi vào hệ thống thật.</p></div>
      <button class="secondary-btn" type="button" data-pm-reset>${icon("undo")}Khôi phục dữ liệu mẫu</button>
    </div>
    <nav class="pm-tabs" data-pm-scroll>
      ${PM_TABS.map((tab) => `<button class="pm-tab${pmUi.tab === tab.key && pmUi.view === "" ? " active" : ""}" type="button" data-pm-tab="${tab.key}">${tab.name}${tab.key === "approvals" && pendingApprovals ? `<span class="pm-tab-count">${pendingApprovals}</span>` : ""}</button>`).join("")}
    </nav>
    ${screen}
    ${pmModalHtml()}`;
}

/** Trang con trong Cấu hình hệ thống — app.js gọi hàm này khi route là /cai-dat/khuyen-mai. */
function promotionSettingsPage() {
  if (!pmUi.sim.date) pmUi.sim.date = pmToday();
  return `<section class="pm-root people-page">${promotionBody()}</section>`;
}

/* ------------------------------------------------------------------ Tương tác */

/** Ghi giá trị ô input vào draft đang mở (form động). */
function pmDraftSet(key, value) {
  const draft = pmUi.draft;
  if (!draft) return;
  if (key.startsWith("extra.")) draft.extra = { ...(draft.extra || {}), [key.slice(6)]: value };
  else draft[key] = value;
}

function pmCollectDraft(root) {
  root.querySelectorAll("[data-pm-input]").forEach((node) => pmDraftSet(node.dataset.pmInput, node.type === "number" ? Number(node.value || 0) : node.value === "true" ? true : node.value));
  root.querySelectorAll("[data-pm-extra]").forEach((node) => pmDraftSet(`extra.${node.dataset.pmExtra}`, node.type === "number" ? Number(node.value || 0) : node.value));
}

/** Chọn nhóm/loại: đồng bộ phương thức + giá trị mặc định của loại đó. */
function pmApplyType(groupKey, typeKey) {
  const catalog = pmCatalog();
  const type = pmTypeOf(catalog, groupKey, typeKey);
  const draft = pmUi.draft;
  draft.group = groupKey;
  draft.type = typeKey;
  if (type) { draft.method = type.method; draft.value = type.value; }
  draft.extra = { ...(draft.extra || {}) };
}

function pmOpenForm(promotion) {
  pmUi.draft = promotion ? { ...promotion, courses: [...(promotion.courses || [])], branches: [...(promotion.branches || [])], tags: [...(promotion.tags || [])], extra: { ...(promotion.extra || {}) } } : pmBlankPromotion();
  pmUi.draftTab = "general";
  pmUi.view = "form";
}

/** Lưu form: kiểm tra tối thiểu rồi ghi vào store. */
function pmSaveDraft() {
  const root = document.querySelector(".pm-root");
  if (!root || !pmUi.draft) return;
  pmCollectDraft(root);
  const draft = pmUi.draft;
  if (!String(draft.name || "").trim()) return toast("Chưa nhập tên chương trình khuyến mãi.");
  if (!String(draft.code || "").trim()) return toast("Chưa nhập mã chương trình.");
  const payload = { ...draft, code: String(draft.code).trim().toUpperCase(), name: String(draft.name).trim() };
  delete payload.id;
  const saved = draft.id ? pmUpdatePromotion(draft.id, payload) : pmCreatePromotion(payload);
  pmUi.view = "";
  pmUi.detailId = saved ? saved.id : pmUi.detailId;
  pmRefresh();
  toast(draft.id ? `Đã lưu thay đổi cho ${saved?.name || ""}.` : `Đã tạo chương trình ${saved?.name || ""}.`);
}

/** Xuất CSV phía trình duyệt (Blob + link tải). */
function pmDownloadCsv(filename, headers, rows) {
  const csv = pmCsv(headers, rows);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Đã xuất ${filename}.`);
}

function pmExportPromotions() {
  const catalog = pmCatalog();
  const rows = pmListRows().map((promotion) => [
    promotion.code,
    promotion.name,
    (pmGroup(catalog, promotion.group) || {}).name || promotion.group,
    pmPromotionTypeName(catalog, promotion),
    promotion.method === "percent" ? `${promotion.value}%` : pmFormatMoney(promotion.value),
    promotion.maxDiscount || 0,
    promotion.minTuition || 0,
    promotion.startDate,
    promotion.endDate,
    promotion.usageLimit || 0,
    promotion.usedCount,
    promotion.usedAmount,
    promotion.stackable ? "Cộng gộp" : "Không cộng gộp",
    promotion.approvalRequired ? "Cần duyệt" : "Không cần duyệt",
    pmStatusMeta(catalog, promotion.status).name,
  ]);
  pmDownloadCsv("khuyen-mai.csv", ["Mã", "Tên chương trình", "Nhóm", "Loại", "Mức giảm", "Trần giảm", "Học phí tối thiểu", "Bắt đầu", "Kết thúc", "Giới hạn lượt", "Đã dùng", "Giá trị đã giảm", "Cộng gộp", "Phê duyệt", "Trạng thái"], rows);
}

function pmExportVouchers() {
  const rows = pmVoucherRows().map((voucher) => {
    const promotion = pmPromotionById(voucher.promotionId);
    return [voucher.code, promotion?.code || "", promotion?.name || "", voucher.holder || "", voucher.issuedAt, voucher.usedAt || "", voucher.amount || 0, (catalogVoucherStatus(voucher.status) || {}).name || voucher.status];
  });
  pmDownloadCsv("voucher.csv", ["Mã voucher", "Mã chương trình", "Chương trình", "Người giữ", "Phát hành", "Sử dụng", "Giá trị giảm", "Trạng thái"], rows);
}

function pmExportUsage() {
  const rows = pmHistoryRows().map((row) => {
    const promotion = pmPromotionById(row.promotionId);
    return [row.date, row.student, promotion?.code || "", promotion?.name || "", pmCourseName(row.course), pmBranchName(row.branch), row.channel || "", row.amount];
  });
  pmDownloadCsv("lich-su-khuyen-mai.csv", ["Ngày", "Học viên", "Mã chương trình", "Chương trình", "Khóa học", "Chi nhánh", "Kênh thu", "Số tiền giảm"], rows);
}

function catalogVoucherStatus(key) {
  return (pmCatalog().voucherStatus || []).find((item) => item.key === key);
}

/** Gán học viên cho học viên mẫu đang chọn (simulator). */
function pmSimStudentCourses(student) {
  return (student?.enrolled || []).slice();
}

/** Nối các hàm đã tách sang file khác (chỉ dùng cho gỡ lỗi / test nhanh). */
function bindPromotionEvents() {
  const root = document.querySelector(".pm-root");
  if (!root) return;

  root.querySelectorAll("[data-pm-tab]").forEach((button) => button.addEventListener("click", () => {
    pmUi.tab = button.dataset.pmTab;
    pmUi.view = "";
    pmRefresh();
  }));

  root.querySelectorAll("[data-pm-detail]").forEach((node) => node.addEventListener("click", (event) => {
    event.stopPropagation();
    pmUi.detailId = node.dataset.pmDetail;
    pmUi.view = "detail";
    pmRefresh();
  }));

  root.querySelectorAll("[data-pm-edit]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const promotion = pmPromotionById(button.dataset.pmEdit);
    if (promotion) { pmOpenForm(promotion); pmRefresh(); }
  }));

  root.querySelector("[data-pm-new]")?.addEventListener("click", () => { pmOpenForm(null); pmRefresh(); });

  root.querySelectorAll("[data-pm-back-list]").forEach((button) => button.addEventListener("click", () => { pmUi.view = ""; pmUi.tab = "list"; pmRefresh(); }));

  root.querySelectorAll("[data-pm-duplicate]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const copy = pmDuplicatePromotion(button.dataset.pmDuplicate);
    pmRefresh();
    if (copy) toast(`Đã nhân bản thành ${copy.name}.`);
  }));

  root.querySelectorAll("[data-pm-toggle]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const promotion = pmPromotionById(button.dataset.pmToggle);
    if (!promotion) return;
    const status = promotion.status === "active" ? "disabled" : "active";
    pmSetPromotionStatus(promotion.id, status);
    pmRefresh();
    toast(`${promotion.name}: ${pmStatusMeta(pmCatalog(), status).name}.`);
  }));

  root.querySelectorAll("[data-pm-delete]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const promotion = pmPromotionById(button.dataset.pmDelete);
    if (!promotion) return;
    pmUi.modal = { kind: "delete", id: promotion.id, title: `Xóa ${promotion.name}?`, okLabel: "Xóa chương trình" };
    pmRefresh();
  }));

  // Bộ lọc + phân trang danh sách.
  root.querySelectorAll("[data-pm-list]").forEach((node) => node.addEventListener(node.tagName === "SELECT" ? "change" : "input", () => {
    pmUi.list[node.dataset.pmList] = node.value;
    pmUi.list.page = 1;
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-page]").forEach((button) => button.addEventListener("click", () => { pmUi.list.page = Number(button.dataset.pmPage); pmRefresh(); }));
  root.querySelector("[data-pm-page-size]")?.addEventListener("change", (event) => { pmUi.list.pageSize = Number(event.currentTarget.value); pmUi.list.page = 1; pmRefresh(); });

  // Bộ lọc dashboard.
  root.querySelectorAll("[data-pm-dash]").forEach((node) => node.addEventListener("change", () => { pmUi.dash[node.dataset.pmDash] = node.value; pmRefresh(); }));
  root.querySelector("[data-pm-dash-reset]")?.addEventListener("click", () => { pmUi.dash = { branch: "", group: "", from: "", to: "" }; pmRefresh(); });

  // Bộ lọc voucher / lịch sử / phê duyệt.
  root.querySelectorAll("[data-pm-voucher]").forEach((node) => node.addEventListener(node.tagName === "SELECT" ? "change" : "input", () => { pmUi.vouchers[node.dataset.pmVoucher] = node.value; pmRefresh(); }));
  root.querySelectorAll("[data-pm-history]").forEach((node) => node.addEventListener(node.tagName === "SELECT" ? "change" : "input", () => { pmUi.history[node.dataset.pmHistory] = node.value; pmRefresh(); }));
  root.querySelector("[data-pm-approval]")?.addEventListener("change", (event) => { pmUi.approvals.status = event.currentTarget.value; pmRefresh(); });

  // Mở bản ghi từ dòng bảng.
  root.querySelectorAll("[data-pm-open]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("[data-pm-noopen]") || event.target.closest("input") || event.target.closest("button")) return;
    pmUi.detailId = row.dataset.pmOpen;
    pmUi.view = "detail";
    pmRefresh();
  }));

  // Form: chuyển tab, trường động, lưu.
  root.querySelectorAll("[data-pm-form-tab]").forEach((button) => button.addEventListener("click", () => { pmCollectDraft(root); pmUi.draftTab = button.dataset.pmFormTab; pmRefresh(); }));
  root.querySelectorAll("[data-pm-group]").forEach((node) => node.addEventListener("change", () => {
    pmCollectDraft(root);
    const catalog = pmCatalog();
    const firstType = (pmGroup(catalog, node.dataset.pmGroup === "group" ? node.value : node.value)?.types || [])[0];
    pmApplyType(node.value, firstType ? firstType.key : "");
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-type]").forEach((node) => node.addEventListener("change", () => { pmCollectDraft(root); pmApplyType(pmUi.draft.group, node.value); pmRefresh(); }));
  root.querySelectorAll("[data-pm-method]").forEach((node) => node.addEventListener("change", () => { pmCollectDraft(root); pmUi.draft.method = node.value; pmRefresh(); }));
  root.querySelectorAll("[data-pm-multi]").forEach((node) => node.addEventListener("change", () => {
    const key = node.dataset.pmMulti;
    const values = Array.from(root.querySelectorAll(`[data-pm-multi="${key}"]`)).filter((item) => item.checked).map((item) => item.value);
    pmDraftSet(key, values);
  }));
  root.querySelector("[data-pm-save]")?.addEventListener("click", pmSaveDraft);

  // Voucher: sinh mã, gán người giữ, đánh dấu dùng, xóa.
  root.querySelectorAll("[data-pm-generate]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const promotion = pmPromotionById(button.dataset.pmGenerate);
    pmUi.modal = { kind: "generate", promotionId: promotion ? promotion.id : pmStore().promotions[0]?.id, prefix: promotion?.extra?.voucherPrefix || "", count: 5, title: "Sinh mã voucher", okLabel: "Sinh mã" };
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-assign]").forEach((button) => button.addEventListener("click", () => { pmUi.modal = { kind: "assign", id: button.dataset.pmAssign, title: "Gán người giữ mã", okLabel: "Gán" }; pmRefresh(); }));
  root.querySelectorAll("[data-pm-use]").forEach((button) => button.addEventListener("click", () => {
    const voucher = pmStore().vouchers.find((item) => item.id === button.dataset.pmUse);
    if (!voucher) return;
    if (voucher.status === "used") { pmSetVoucherStatus(voucher.id, "unused", { usedAt: "", amount: 0 }); toast(`Đã hoàn lại lượt dùng cho ${voucher.code}.`); } else { pmSetVoucherStatus(voucher.id, "used", { usedAt: pmToday(), amount: voucher.amount || pmDiscountAmount(pmPromotionById(voucher.promotionId) || {}, { courses: pmCatalog().courses.slice(0, 1) }).amount }); toast(`Đã ghi nhận ${voucher.code} đã sử dụng.`); }
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-delete-voucher]").forEach((button) => button.addEventListener("click", () => {
    const store = pmStore();
    store.vouchers = store.vouchers.filter((item) => item.id !== button.dataset.pmDeleteVoucher);
    pmPersist();
    pmRefresh();
    toast("Đã xóa mã voucher.");
  }));

  // Phê duyệt học bổng.
  root.querySelectorAll("[data-pm-approve]").forEach((button) => button.addEventListener("click", () => { pmUi.modal = { kind: "decide", id: button.dataset.pmApprove, decision: "approved", title: "Duyệt hồ sơ học bổng", okLabel: "Duyệt" }; pmRefresh(); }));
  root.querySelectorAll("[data-pm-reject]").forEach((button) => button.addEventListener("click", () => { pmUi.modal = { kind: "decide", id: button.dataset.pmReject, decision: "rejected", title: "Từ chối hồ sơ học bổng", okLabel: "Từ chối" }; pmRefresh(); }));

  // Xuất CSV.
  root.querySelector("[data-pm-export-csv]")?.addEventListener("click", pmExportPromotions);
  root.querySelector("[data-pm-export-vouchers]")?.addEventListener("click", pmExportVouchers);
  root.querySelector("[data-pm-export-usage]")?.addEventListener("click", pmExportUsage);
  root.querySelector("[data-pm-reset]")?.addEventListener("click", () => { pmUi.modal = { kind: "reset", title: "Khôi phục dữ liệu mẫu", okLabel: "Khôi phục" }; pmRefresh(); });

  // Popup: đóng / xác nhận.
  root.querySelectorAll("[data-pm-close-modal]").forEach((node) => node.addEventListener("click", (event) => {
    if (event.target.closest("[data-pm-modal-card]") && !event.target.closest("[data-pm-close-modal]")) return;
    pmUi.modal = null;
    pmRefresh();
  }));
  root.querySelector("[data-pm-modal-ok]")?.addEventListener("click", () => {
    const modal = pmUi.modal;
    if (!modal) return;
    if (modal.kind === "delete") { pmDeletePromotion(modal.id); toast("Đã xóa chương trình khuyến mãi."); }
    else if (modal.kind === "reset") { pmResetStore(); toast("Đã khôi phục dữ liệu mẫu ban đầu."); }
    else if (modal.kind === "generate") {
      const promotionId = root.querySelector("[data-pm-gen='promotion']")?.value || modal.promotionId;
      const prefix = root.querySelector("[data-pm-gen='prefix']")?.value || "VOUCHER";
      const count = Number(root.querySelector("[data-pm-gen='count']")?.value || 5);
      const created = pmGenerateVouchers(promotionId, prefix, count);
      toast(`Đã sinh ${created.length} mã voucher.`);
    } else if (modal.kind === "assign") {
      const holder = String(root.querySelector("[data-pm-assign-holder]")?.value || "").trim();
      if (!holder) return toast("Chưa nhập tên người giữ mã.");
      pmAssignVoucher(modal.id, holder);
      toast(`Đã gán mã cho ${holder}.`);
    } else if (modal.kind === "decide") {
      const note = String(root.querySelector("[data-pm-decide-note]")?.value || "").trim();
      if (modal.decision === "approved" && !note) return toast("Cần ghi căn cứ trước khi duyệt hồ sơ.");
      const row = pmDecideScholarship(modal.id, modal.decision, note);
      if (row) {
        pmUi.sim.choice = "";
        toast(modal.decision === "approved" ? `Đã duyệt học bổng cho ${row.student}.` : `Đã từ chối hồ sơ của ${row.student}.`);
      }
    }
    pmUi.modal = null;
    pmRefresh();
  });

  // Simulator.
  root.querySelectorAll("[data-pm-sim]").forEach((node) => node.addEventListener(node.tagName === "SELECT" || node.type === "number" || node.type === "date" ? "change" : "input", () => {
    pmUi.sim[node.dataset.pmSim] = node.value;
    if (node.dataset.pmSim === "studentId") {
      const student = pmCatalog().students.find((item) => item.id === node.value);
      pmUi.sim.courses = pmSimStudentCourses(student);
      pmUi.sim.branch = student?.branch || pmUi.sim.branch;
      pmUi.sim.choice = "";
    }
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-sim-course]").forEach((node) => node.addEventListener("change", () => {
    const ids = Array.from(root.querySelectorAll("[data-pm-sim-course]")).filter((item) => item.checked).map((item) => item.value);
    pmUi.sim.courses = ids;
    pmUi.sim.choice = "";
    pmRefresh();
  }));
  root.querySelectorAll("[data-pm-sim-choice]").forEach((node) => node.addEventListener("change", () => {
    pmUi.sim.choice = node.dataset.pmSimChoice;
    pmRefresh();
  }));
}

if (typeof window !== "undefined") {
  window.promotionSettingsPage = promotionSettingsPage;
  window.bindPromotionEvents = bindPromotionEvents;
  window.pmUi = pmUi;
}
