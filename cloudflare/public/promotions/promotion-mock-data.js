/*
 * Dữ liệu mẫu (mock) của module Cấu hình khuyến mãi.
 * File này CHỨA DỮ LIỆU THUẦN TÚI: không gọi API, không đọc/ghi database,
 * không import bất kỳ module nào khác. UI và hàm tính toán lấy dữ liệu từ đây
 * rồi tự quản lý bằng state phía trình duyệt (xem promotion-store.js).
 */

/** 2 chi nhánh của trung tâm. */
const PM_BRANCHES = [
  { id: "br-1", name: "STEPS — Cơ sở 1 (Trương Quốc Dụng)" },
  { id: "br-2", name: "STEPS — Cơ sở 2 (Hải Thượng Lãn Ông)" },
];

/** 15 khóa học với học phí gốc. */
const PM_COURSES = [
  { id: "cr-01", name: "IELTS Foundation", tuition: 5000000, sessions: 24 },
  { id: "cr-02", name: "IELTS Advanced", tuition: 6000000, sessions: 24 },
  { id: "cr-03", name: "English Communication", tuition: 4000000, sessions: 20 },
  { id: "cr-04", name: "Kids English", tuition: 3500000, sessions: 24 },
  { id: "cr-05", name: "TOEIC Preparation", tuition: 4500000, sessions: 24 },
  { id: "cr-06", name: "Cambridge Starters", tuition: 3000000, sessions: 20 },
  { id: "cr-07", name: "Cambridge Movers", tuition: 3200000, sessions: 20 },
  { id: "cr-08", name: "Cambridge Flyers", tuition: 3400000, sessions: 20 },
  { id: "cr-09", name: "Giao tiếp nền tảng (Starter)", tuition: 3000000, sessions: 16 },
  { id: "cr-10", name: "Speaking Launch", tuition: 4200000, sessions: 20 },
  { id: "cr-11", name: "Ngữ pháp nền tảng", tuition: 2800000, sessions: 16 },
  { id: "cr-12", name: "Phát âm Accent USA", tuition: 2500000, sessions: 12 },
  { id: "cr-13", name: "TOEIC Listening", tuition: 4800000, sessions: 24 },
  { id: "cr-14", name: "Pre-IELTS", tuition: 4000000, sessions: 20 },
  { id: "cr-15", name: "Business English", tuition: 5500000, sessions: 24 },
];

/** Nhãn nhóm học viên dùng làm điều kiện áp dụng. */
const PM_STUDENT_TAGS = [
  { key: "new", name: "Học viên mới" },
  { key: "studying", name: "Đang học" },
  { key: "returning", name: "Quay lại sau nghỉ" },
  { key: "sibling", name: "Anh chị em ruột" },
  { key: "referral", name: "Được giới thiệu" },
  { key: "loyal", name: "Gắn bó từ 12 tháng" },
  { key: "partner", name: "Con em đối tác" },
  { key: "excellent", name: "Học lực Giỏi trở lên" },
  { key: "hardship", name: "Hoàn cảnh khó khăn" },
  { key: "birthday", name: "Sinh nhật trong kỳ" },
];

/**
 * 5 nhóm nghiệp vụ + danh mục chương trình trong từng nhóm.
 * `fields` là các trường chỉ hiện khi chọn chương trình đó (form động).
 */
const PM_GROUPS = [
  {
    key: "customer",
    name: "Khuyến mãi theo đối tượng học viên",
    types: [
      { key: "sibling", name: "Anh chị em ruột — giảm 50% khóa thứ 2 (Sibling Discount)", method: "percent", value: 50, fields: ["siblingRelation", "appliesTo"] },
      { key: "referral", name: "Giới thiệu bạn bè (Referral)", method: "percent", value: 10, fields: ["rewardTarget", "requiresReferral"] },
      { key: "loyalty", name: "Học viên thân thiết 5–10% (Loyalty)", method: "percent", value: 8, fields: ["monthsRequired"] },
      { key: "returning", name: "Học viên quay lại — 15% (Returning Student)", method: "percent", value: 15, fields: [] },
      { key: "partner", name: "Ưu đãi đối tác — 10% (Partner)", method: "percent", value: 10, fields: ["partnerName"] },
      { key: "groupStudent", name: "Học viên cùng trường/nhóm — 10% (Group Student)", method: "percent", value: 10, fields: ["minStudents"] },
    ],
  },
  {
    key: "volume",
    name: "Khuyến mãi theo số lượng / gói khóa",
    types: [
      { key: "bundle2", name: "Đăng ký 2 khóa — 10%", method: "percent", value: 10, fields: ["minCourses"] },
      { key: "bundle3", name: "Đăng ký 3 khóa — 15%", method: "percent", value: 15, fields: ["minCourses"] },
      { key: "bundle4", name: "Đăng ký 4 khóa — 20%", method: "percent", value: 20, fields: ["minCourses"] },
      { key: "prepay3", name: "Đóng trước 3 tháng — 5%", method: "percent", value: 5, fields: ["prepayMonths"] },
      { key: "prepay6", name: "Đóng trước 6 tháng — 10%", method: "percent", value: 10, fields: ["prepayMonths"] },
      { key: "prepayFull", name: "Đóng trọn khóa — giảm 500.000đ", method: "amount", value: 500000, fields: [] },
      { key: "group3", name: "Nhóm từ 3 học viên — 10%", method: "percent", value: 10, fields: ["minStudents"] },
      { key: "bogo", name: "Mua 2 tặng 1 (Buy 2 Get 1)", method: "free_course", value: 1, fields: ["buyCount", "freeCount"] },
    ],
  },
  {
    key: "scholarship",
    name: "Học bổng / miễn giảm học phí",
    types: [
      { key: "full100", name: "Học bổng toàn phần 100%", method: "percent", value: 100, fields: ["reason", "approver"] },
      { key: "half50", name: "Học bổng bán phần 50%", method: "percent", value: 50, fields: ["reason", "approver"] },
      { key: "partial30", name: "Học bổng một phần 30%", method: "percent", value: 30, fields: ["reason", "approver"] },
      { key: "waiver1m", name: "Miễn giảm cố định 1.000.000đ", method: "amount", value: 1000000, fields: ["reason"] },
      { key: "freeSession", name: "Miễn phí 2 buổi học", method: "free_session", value: 2, fields: ["sessionCount"] },
      { key: "freeCourse", name: "Tặng khóa học", method: "free_course", value: 1, fields: ["reason"] },
      { key: "academic", name: "Học bổng học lực Giỏi", method: "percent", value: 50, fields: ["gradeMin", "approver"] },
      { key: "special", name: "Học bổng hoàn cảnh đặc biệt", method: "percent", value: 70, fields: ["reason", "approver"] },
    ],
  },
  {
    key: "time",
    name: "Khuyến mãi theo thời điểm",
    types: [
      { key: "earlyBird", name: "Đăng ký sớm (Early Bird) — 15%", method: "percent", value: 15, fields: ["earlyDays"] },
      { key: "flashSale", name: "Flash Sale 48 giờ — 30%", method: "percent", value: 30, fields: ["windowHours"] },
      { key: "summer", name: "Hè 2027 — 20%", method: "percent", value: 20, fields: [] },
      { key: "backToSchool", name: "Back to School — 15%", method: "percent", value: 15, fields: [] },
      { key: "christmas", name: "Giáng sinh — 10%", method: "percent", value: 10, fields: [] },
      { key: "newYear", name: "Chào năm mới — 20%", method: "percent", value: 20, fields: [] },
      { key: "birthday", name: "Voucher sinh nhật 500.000đ", method: "amount", value: 500000, fields: [] },
      { key: "newStudent", name: "Học viên mới — 15%", method: "percent", value: 15, fields: [] },
      { key: "reEnroll", name: "Tái enrollment — 10%", method: "percent", value: 10, fields: [] },
    ],
  },
  {
    key: "voucher",
    name: "Voucher / giảm giá trực tiếp",
    types: [
      { key: "vchPercent", name: "Voucher giảm theo %", method: "percent", value: 10, fields: ["voucherPrefix", "voucherQuantity"] },
      { key: "vchAmount", name: "Voucher giảm số tiền cố định", method: "amount", value: 300000, fields: ["voucherPrefix", "voucherQuantity"] },
      { key: "vchFreeTuition", name: "Voucher miễn học phí 100%", method: "percent", value: 100, fields: ["voucherPrefix"] },
      { key: "vchCapped", name: "Voucher % có hạn mức tối đa", method: "percent", value: 20, fields: ["voucherPrefix", "maxDiscount"] },
      { key: "vchFirstPayment", name: "Voucher cho lần đóng đầu tiên", method: "percent", value: 8, fields: ["paymentStage"] },
      { key: "vchNextPayment", name: "Voucher cho lần đóng tiếp theo", method: "percent", value: 6, fields: ["paymentStage"] },
      { key: "vchBuyXGetY", name: "Voucher mua X tặng Y", method: "free_course", value: 1, fields: ["buyCount", "freeCount", "voucherPrefix"] },
      { key: "vchFreeCourse", name: "Voucher tặng khóa học", method: "free_course", value: 1, fields: ["voucherPrefix"] },
    ],
  },
];

/** 7 trạng thái theo nghiệp vụ. */
const PM_STATUSES = [
  { key: "draft", name: "Bản nháp", badge: "slate" },
  { key: "pending", name: "Chờ phê duyệt", badge: "amber" },
  { key: "scheduled", name: "Sắp diễn ra", badge: "blue" },
  { key: "active", name: "Đang hoạt động", badge: "green" },
  { key: "expired", name: "Đã hết hạn", badge: "slate" },
  { key: "disabled", name: "Đã tắt", badge: "red" },
  { key: "rejected", name: "Bị từ chối", badge: "red" },
];

/** Cách tính tiền giảm. */
const PM_METHODS = [
  { key: "percent", name: "% học phí" },
  { key: "amount", name: "Số tiền cố định" },
  { key: "free_course", name: "Tặng khóa học" },
  { key: "free_session", name: "Miễn buổi học" },
];

/** 20 học viên mẫu. */
const PM_STUDENTS = [
  { id: "hv-01", code: "HV0001", name: "Nguyễn Hà Phương Anh", branch: "br-1", tags: ["new", "birthday"], months: 0, grade: 8.6, enrolled: ["cr-01"] },
  { id: "hv-02", code: "HV0002", name: "Trần Quốc Bảo", branch: "br-1", tags: ["studying", "loyal"], months: 18, grade: 7.9, enrolled: ["cr-02", "cr-03"] },
  { id: "hv-03", code: "HV0003", name: "Lê Khánh Chi", branch: "br-2", tags: ["sibling", "studying"], months: 9, grade: 8.8, enrolled: ["cr-04"] },
  { id: "hv-04", code: "HV0004", name: "Phạm Gia Hưng", branch: "br-2", tags: ["sibling", "new"], months: 0, grade: 8.1, enrolled: ["cr-04"] },
  { id: "hv-05", code: "HV0005", name: "Hoàng Mai Anh", branch: "br-1", tags: ["referral", "new"], months: 0, grade: 9.0, enrolled: ["cr-01", "cr-12"] },
  { id: "hv-06", code: "HV0006", name: "Vũ Đức Minh", branch: "br-1", tags: ["studying", "excellent"], months: 14, grade: 9.2, enrolled: ["cr-05"] },
  { id: "hv-07", code: "HV0007", name: "Đặng Thu Trang", branch: "br-2", tags: ["returning"], months: 6, grade: 7.4, enrolled: ["cr-03"] },
  { id: "hv-08", code: "HV0008", name: "Bùi Ngọc Hân", branch: "br-1", tags: ["hardship", "studying"], months: 11, grade: 8.9, enrolled: ["cr-06"] },
  { id: "hv-09", code: "HV0009", name: "Đỗ Nhật Nam", branch: "br-2", tags: ["partner", "new"], months: 0, grade: 8.0, enrolled: ["cr-15"] },
  { id: "hv-10", code: "HV0010", name: "Ngô Lan Anh", branch: "br-1", tags: ["loyal", "excellent"], months: 26, grade: 9.4, enrolled: ["cr-02", "cr-10"] },
  { id: "hv-11", code: "HV0011", name: "Trương Bảo Ngọc", branch: "br-1", tags: ["new"], months: 0, grade: 8.2, enrolled: ["cr-09"] },
  { id: "hv-12", code: "HV0012", name: "Lý Hải Yến", branch: "br-2", tags: ["referral", "studying"], months: 4, grade: 7.8, enrolled: ["cr-07"] },
  { id: "hv-13", code: "HV0013", name: "Phan Thanh Tùng", branch: "br-2", tags: ["returning", "loyal"], months: 15, grade: 7.2, enrolled: ["cr-13"] },
  { id: "hv-14", code: "HV0014", name: "Cao Thiên Kim", branch: "br-1", tags: ["birthday", "studying"], months: 8, grade: 8.5, enrolled: ["cr-03"] },
  { id: "hv-15", code: "HV0015", name: "Hoàng Anh Tuấn", branch: "br-1", tags: ["new"], months: 0, grade: 6.9, enrolled: ["cr-11"] },
  { id: "hv-16", code: "HV0016", name: "Nguyễn Thảo Vy", branch: "br-2", tags: ["sibling", "loyal"], months: 20, grade: 8.7, enrolled: ["cr-08", "cr-14"] },
  { id: "hv-17", code: "HV0017", name: "Trần Đình Phong", branch: "br-1", tags: ["studying"], months: 7, grade: 7.6, enrolled: ["cr-05", "cr-13"] },
  { id: "hv-18", code: "HV0018", name: "Đinh Như Ý", branch: "br-2", tags: ["hardship", "new"], months: 0, grade: 8.4, enrolled: ["cr-06"] },
  { id: "hv-19", code: "HV0019", name: "Mai Tiến Đạt", branch: "br-1", tags: ["excellent", "loyal"], months: 22, grade: 9.1, enrolled: ["cr-15"] },
  { id: "hv-20", code: "HV0020", name: "Võ Hoàng Yến", branch: "br-2", tags: ["new"], months: 0, grade: 8.0, enrolled: ["cr-01"] },
];

/**
 * 20 chương trình khuyến mãi. `extra` chứa trường riêng của từng loại
 * (quan hệ anh chị em, số khóa tối thiểu, lý do + người duyệt, …).
 */
const PM_PROMOTIONS = [
  {
    id: "km-01", code: "SIBLING50", name: "Anh chị em ruột — giảm 50% khóa thứ hai", group: "customer", type: "sibling",
    method: "percent", value: 50, maxDiscount: 3000000, minTuition: 3000000,
    branches: ["br-1", "br-2"], courses: ["cr-04", "cr-06", "cr-07", "cr-08"], tags: ["sibling"],
    startDate: "2026-08-01", endDate: "2026-12-31", usageLimit: 120, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "active", usedCount: 34, usedAmount: 59500000,
    extra: { siblingRelation: "Anh/chị/em ruột", appliesTo: "Khóa học thứ hai trở đi" },
    createdBy: "Bùi Văn Vũ", createdAt: "2026-07-20", note: "Áp dụng khi hai anh chị em cùng đóng phí trong một kỳ.",
  },
  {
    id: "km-02", code: "REFERRAL10", name: "Người cũ giới thiệu người mới — giảm 10% cả hai", group: "customer", type: "referral",
    method: "percent", value: 10, maxDiscount: 800000, minTuition: 2500000,
    branches: ["br-1", "br-2"], courses: [], tags: ["referral"],
    startDate: "2026-09-01", endDate: "2027-03-31", usageLimit: 200, usagePerStudent: 2,
    stackable: true, approvalRequired: false, status: "active", usedCount: 46, usedAmount: 18400000,
    extra: { rewardTarget: "Cả người giới thiệu và người được giới thiệu", requiresReferral: true },
    createdBy: "Nguyễn Thị Lan", createdAt: "2026-08-25", note: "Cần ghi nhận mã giới thiệu trên phiếu thu.",
  },
  {
    id: "km-03", code: "LOYAL8", name: "Học viên gắn bó từ 12 tháng — giảm 8%", group: "customer", type: "loyalty",
    method: "percent", value: 8, maxDiscount: 600000, minTuition: 3000000,
    branches: ["br-1"], courses: ["cr-01", "cr-02", "cr-05", "cr-13", "cr-15"], tags: ["loyal"],
    startDate: "2026-06-01", endDate: "2026-11-30", usageLimit: 80, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "expired", usedCount: 21, usedAmount: 7560000,
    extra: { monthsRequired: 12 },
    createdBy: "Nguyễn Thị Lan", createdAt: "2026-05-18", note: "Số tháng học liên tục tại trung tâm.",
  },
  {
    id: "km-04", code: "RETURN15", name: "Học viên quay lại sau nghỉ — giảm 15%", group: "customer", type: "returning",
    method: "percent", value: 15, maxDiscount: 900000, minTuition: 2800000,
    branches: ["br-1", "br-2"], courses: [], tags: ["returning"],
    startDate: "2026-11-15", endDate: "2027-02-28", usageLimit: 60, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "draft", usedCount: 0, usedAmount: 0,
    extra: {},
    createdBy: "Bùi Văn Vũ", createdAt: "2026-10-28", note: "Chưa chốt mức trần trợ giá cho nhóm này.",
  },
  {
    id: "km-05", code: "PARTNER10", name: "Con em đối tác Viettel Tech — giảm 10%", group: "customer", type: "partner",
    method: "percent", value: 10, maxDiscount: 1200000, minTuition: 0,
    branches: ["br-2"], courses: ["cr-15", "cr-05", "cr-13"], tags: ["partner"],
    startDate: "2026-03-01", endDate: "2026-09-30", usageLimit: 40, usagePerStudent: 2,
    stackable: true, approvalRequired: false, status: "expired", usedCount: 12, usedAmount: 4320000,
    extra: { partnerName: "Viettel Tech Hà Tĩnh" },
    createdBy: "Trần Minh Đức", createdAt: "2026-02-20", note: "Hợp đồng đối tác hết hạn 30/09/2026.",
  },
  {
    id: "km-06", code: "BUNDLE3", name: "Đăng ký 3 khóa cùng lúc — giảm 15%", group: "volume", type: "bundle3",
    method: "percent", value: 15, maxDiscount: 2500000, minTuition: 9000000,
    branches: ["br-1", "br-2"], courses: [], tags: [],
    startDate: "2026-10-01", endDate: "2026-12-31", usageLimit: 50, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "active", usedCount: 9, usedAmount: 20250000,
    extra: { minCourses: 3 },
    createdBy: "Bùi Văn Vũ", createdAt: "2026-09-28", note: "Tính trên tổng học phí của 3 khóa đóng một lần.",
  },
  {
    id: "km-07", code: "PREPAY6", name: "Đóng trước 6 tháng — giảm 10%", group: "volume", type: "prepay6",
    method: "percent", value: 10, maxDiscount: 1500000, minTuition: 12000000,
    branches: ["br-1"], courses: ["cr-01", "cr-02", "cr-10", "cr-15"], tags: [],
    startDate: "2026-12-01", endDate: "2027-06-30", usageLimit: 35, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "scheduled", usedCount: 0, usedAmount: 0,
    extra: { prepayMonths: 6 },
    createdBy: "Trần Minh Đức", createdAt: "2026-10-30", note: "Cần Kế toán trưởng duyệt từng hồ sơ.",
  },
  {
    id: "km-08", code: "FULLCOURSE500", name: "Đóng trọn khóa — giảm 500.000đ", group: "volume", type: "prepayFull",
    method: "amount", value: 500000, maxDiscount: 500000, minTuition: 3000000,
    branches: ["br-1", "br-2"], courses: [], tags: [],
    startDate: "2026-07-01", endDate: "2027-06-30", usageLimit: 300, usagePerStudent: 3,
    stackable: true, approvalRequired: false, status: "active", usedCount: 118, usedAmount: 59000000,
    extra: {},
    createdBy: "Nguyễn Thị Lan", createdAt: "2026-06-24", note: "Mỗi khóa đóng trọn phí được giảm một lần.",
  },
  {
    id: "km-09", code: "GROUP3", name: "Nhóm từ 3 học viên — giảm 10%", group: "volume", type: "group3",
    method: "percent", value: 10, maxDiscount: 700000, minTuition: 3000000,
    branches: ["br-2"], courses: ["cr-03", "cr-09", "cr-10"], tags: [],
    startDate: "2026-09-15", endDate: "2026-12-15", usageLimit: 90, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "active", usedCount: 27, usedAmount: 8100000,
    extra: { minStudents: 3 },
    createdBy: "Võ Thị Hồng", createdAt: "2026-09-10", note: "Cùng lớp, cùng lịch khai giảng.",
  },
  {
    id: "km-10", code: "BOGO", name: "Mua 2 khóa giao tiếp — tặng 1 khóa phát âm", group: "volume", type: "bogo",
    method: "free_course", value: 1, maxDiscount: 2500000, minTuition: 7000000,
    branches: ["br-1"], courses: ["cr-03", "cr-09", "cr-10", "cr-12"], tags: [],
    startDate: "2026-05-01", endDate: "2026-10-31", usageLimit: 40, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "disabled", usedCount: 14, usedAmount: 35000000,
    extra: { buyCount: 2, freeCount: 1 },
    createdBy: "Bùi Văn Vũ", createdAt: "2026-04-22", note: "Tắt sớm vì trùng lịch lớp phát âm.",
  },
  {
    id: "km-11", code: "SCH-FULL", name: "Học bổng toàn phần STEPS 100%", group: "scholarship", type: "full100",
    method: "percent", value: 100, maxDiscount: 6000000, minTuition: 0,
    branches: ["br-1", "br-2"], courses: ["cr-01", "cr-02", "cr-05", "cr-13"], tags: ["excellent", "hardship"],
    startDate: "2026-11-01", endDate: "2027-01-31", usageLimit: 6, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "pending", usedCount: 1, usedAmount: 5000000,
    extra: { reason: "Hội đồng xét học bổng đầu vào", approver: "Hiệu trưởng / Chủ tịch hội đồng" },
    createdBy: "Trần Minh Đức", createdAt: "2026-10-20", note: "Tối đa 6 suất mỗi kỳ, xét theo điểm đầu vào.",
  },
  {
    id: "km-12", code: "SCH-HALF", name: "Học bổng bán phần 50%", group: "scholarship", type: "half50",
    method: "percent", value: 50, maxDiscount: 3000000, minTuition: 0,
    branches: ["br-1", "br-2"], courses: ["cr-01", "cr-02", "cr-03", "cr-05"], tags: ["excellent"],
    startDate: "2026-09-01", endDate: "2027-08-31", usageLimit: 30, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "active", usedCount: 11, usedAmount: 26500000,
    extra: { reason: "Học bổng khuyến học của trung tâm", approver: "Giám đốc trung tâm" },
    createdBy: "Nguyễn Thị Lan", createdAt: "2026-08-28", note: "Cần đơn có xác nhận của giáo viên chủ nhiệm.",
  },
  {
    id: "km-13", code: "FREESESSION2", name: "Miễn phí 2 buổi học thử", group: "scholarship", type: "freeSession",
    method: "free_session", value: 2, maxDiscount: 500000, minTuition: 0,
    branches: ["br-1", "br-2"], courses: [], tags: ["new"],
    startDate: "2026-01-01", endDate: "2027-12-31", usageLimit: 500, usagePerStudent: 1,
    stackable: true, approvalRequired: false, status: "active", usedCount: 236, usedAmount: 47200000,
    extra: { sessionCount: 2 },
    createdBy: "Võ Thị Hồng", createdAt: "2025-12-30", note: "Tính theo đơn giá buổi của lớp đăng ký.",
  },
  {
    id: "km-14", code: "SCH-GIOI", name: "Học bổng học lực Giỏi — 50%", group: "scholarship", type: "academic",
    method: "percent", value: 50, maxDiscount: 2000000, minTuition: 3000000,
    branches: ["br-1"], courses: ["cr-06", "cr-07", "cr-08"], tags: ["excellent"],
    startDate: "2026-11-10", endDate: "2027-05-31", usageLimit: 25, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "pending", usedCount: 0, usedAmount: 0,
    extra: { gradeMin: 8.5, approver: "Ban đào tạo" },
    createdBy: "Trần Minh Đức", createdAt: "2026-10-31", note: "Lấy điểm trung bình học kỳ gần nhất.",
  },
  {
    id: "km-15", code: "EARLYBIRD15", name: "Đăng ký sớm khóa 12/2026 — giảm 15%", group: "time", type: "earlyBird",
    method: "percent", value: 15, maxDiscount: 1200000, minTuition: 3000000,
    branches: ["br-1", "br-2"], courses: ["cr-01", "cr-02", "cr-05", "cr-15"], tags: [],
    startDate: "2026-11-20", endDate: "2026-12-05", usageLimit: 100, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "scheduled", usedCount: 0, usedAmount: 0,
    extra: { earlyDays: 15 },
    createdBy: "Bùi Văn Vũ", createdAt: "2026-10-25", note: "Chỉ tính cho hồ sơ nộp trước ngày khai giảng 15 ngày.",
  },
  {
    id: "km-16", code: "FLASH30", name: "Flash Sale 48 giờ — giảm 30%", group: "time", type: "flashSale",
    method: "percent", value: 30, maxDiscount: 1800000, minTuition: 2500000,
    branches: ["br-2"], courses: ["cr-03", "cr-09", "cr-12"], tags: [],
    startDate: "2026-10-10", endDate: "2026-10-12", usageLimit: 60, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "expired", usedCount: 58, usedAmount: 52200000,
    extra: { windowHours: 48 },
    createdBy: "Võ Thị Hồng", createdAt: "2026-09-30", note: "Chạy đúng 48 giờ, đóng khi hết lượt.",
  },
  {
    id: "km-17", code: "NEWYEAR20", name: "Chào năm mới 2027 — giảm 20%", group: "time", type: "newYear",
    method: "percent", value: 20, maxDiscount: 1500000, minTuition: 3000000,
    branches: ["br-1", "br-2"], courses: [], tags: [],
    startDate: "2026-12-26", endDate: "2027-01-10", usageLimit: 150, usagePerStudent: 1,
    stackable: true, approvalRequired: true, status: "draft", usedCount: 0, usedAmount: 0,
    extra: {},
    createdBy: "Trần Minh Đức", createdAt: "2026-10-31", note: "Chờ duyệt ngân sách marketing quý I/2027.",
  },
  {
    id: "km-18", code: "BIRTHDAY500", name: "Voucher sinh nhật 500.000đ", group: "time", type: "birthday",
    method: "amount", value: 500000, maxDiscount: 500000, minTuition: 2000000,
    branches: ["br-1", "br-2"], courses: [], tags: ["birthday"],
    startDate: "2026-01-01", endDate: "2027-12-31", usageLimit: 400, usagePerStudent: 12,
    stackable: true, approvalRequired: false, status: "active", usedCount: 63, usedAmount: 31500000,
    extra: {},
    createdBy: "Nguyễn Thị Lan", createdAt: "2025-12-15", note: "Mỗi tháng sinh nhật được phát 1 voucher.",
  },
  {
    id: "km-19", code: "NEWSTU15", name: "Voucher học viên mới — giảm 15%", group: "voucher", type: "vchPercent",
    method: "percent", value: 15, maxDiscount: 900000, minTuition: 3000000,
    branches: ["br-1", "br-2"], courses: [], tags: ["new"],
    startDate: "2026-10-01", endDate: "2026-12-31", usageLimit: 200, usagePerStudent: 1,
    stackable: false, approvalRequired: false, status: "active", usedCount: 74, usedAmount: 33300000,
    extra: { voucherPrefix: "NEWSTU", voucherQuantity: 12 },
    createdBy: "Võ Thị Hồng", createdAt: "2026-09-26", note: "Phát hành theo lô, mỗi mã dùng một lần.",
  },
  {
    id: "km-20", code: "CAP20", name: "Voucher giảm 20% tối đa 1.000.000đ", group: "voucher", type: "vchCapped",
    method: "percent", value: 20, maxDiscount: 1000000, minTuition: 4000000,
    branches: ["br-2"], courses: ["cr-01", "cr-02", "cr-15"], tags: [],
    startDate: "2026-11-01", endDate: "2026-11-30", usageLimit: 50, usagePerStudent: 1,
    stackable: false, approvalRequired: true, status: "rejected", usedCount: 0, usedAmount: 0,
    extra: { voucherPrefix: "CAP20" },
    createdBy: "Trần Minh Đức", createdAt: "2026-10-29", note: "Bị từ chối vì trùng với Flash Sale quý IV.",
  },
];

/** 30 mã voucher: [mã, khuyến mãi, người giữ, trạng thái, ngày phát hành, ngày dùng, số tiền giảm]. */
const PM_VOUCHER_ROWS = [
  ["NEWSTU-4821", "km-19", "Nguyễn Hà Phương Anh", "used", "2026-10-05", "2026-10-12", 750000],
  ["NEWSTU-4822", "km-19", "Hoàng Mai Anh", "used", "2026-10-05", "2026-10-14", 750000],
  ["NEWSTU-4823", "km-19", "Trương Bảo Ngọc", "unused", "2026-10-06", "", 0],
  ["NEWSTU-4824", "km-19", "Hoàng Anh Tuấn", "unused", "2026-10-06", "", 0],
  ["NEWSTU-4825", "km-19", "Võ Hoàng Yến", "used", "2026-10-08", "2026-10-19", 600000],
  ["NEWSTU-4826", "km-19", "Đinh Như Ý", "expired", "2026-09-02", "", 0],
  ["NEWSTU-4827", "km-19", "Phạm Gia Hưng", "unused", "2026-10-15", "", 0],
  ["NEWSTU-4828", "km-19", "Lý Hải Yến", "used", "2026-10-15", "2026-10-28", 480000],
  ["CAP20-1101", "km-20", "Vũ Đức Minh", "reserved", "2026-11-01", "", 0],
  ["CAP20-1102", "km-20", "Ngô Lan Anh", "reserved", "2026-11-01", "", 0],
  ["CAP20-1103", "km-20", "Mai Tiến Đạt", "unused", "2026-11-01", "", 0],
  ["CAP20-1104", "km-20", "Trần Đình Phong", "unused", "2026-11-01", "", 0],
  ["CAP20-1105", "km-20", "Cao Thiên Kim", "unused", "2026-11-01", "", 0],
  ["BD-6612", "km-18", "Nguyễn Hà Phương Anh", "unused", "2026-11-02", "", 0],
  ["BD-6613", "km-18", "Cao Thiên Kim", "used", "2026-05-18", "2026-05-25", 500000],
  ["BD-6614", "km-18", "Đặng Thu Trang", "used", "2026-07-09", "2026-07-20", 500000],
  ["BD-6615", "km-18", "Bùi Ngọc Hân", "unused", "2026-11-03", "", 0],
  ["BD-6616", "km-18", "Đỗ Nhật Nam", "expired", "2026-03-11", "", 0],
  ["BD-6617", "km-18", "Phan Thanh Tùng", "used", "2026-08-27", "2026-09-05", 500000],
  ["BD-6618", "km-18", "Trần Quốc Bảo", "unused", "2026-11-06", "", 0],
  ["FULL-2201", "km-11", "Bùi Ngọc Hân", "reserved", "2026-10-22", "", 0],
  ["FULL-2202", "km-11", "Đinh Như Ý", "reserved", "2026-10-22", "", 0],
  ["HALF-3301", "km-12", "Vũ Đức Minh", "used", "2026-09-12", "2026-09-18", 2250000],
  ["HALF-3302", "km-12", "Ngô Lan Anh", "used", "2026-09-12", "2026-09-20", 3000000],
  ["HALF-3303", "km-12", "Mai Tiến Đạt", "unused", "2026-10-02", "", 0],
  ["EARLY-5501", "km-15", "Nguyễn Thảo Vy", "unused", "2026-11-20", "", 0],
  ["EARLY-5502", "km-15", "Hoàng Anh Tuấn", "unused", "2026-11-20", "", 0],
  ["FLASH-9001", "km-16", "Lê Khánh Chi", "used", "2026-10-10", "2026-10-11", 960000],
  ["FLASH-9002", "km-16", "Đặng Thu Trang", "used", "2026-10-10", "2026-10-12", 1200000],
  ["FREE2-7701", "km-13", "Võ Hoàng Yến", "used", "2026-10-30", "2026-11-01", 400000],
];

const PM_VOUCHER_STATUS = [
  { key: "unused", name: "Chưa dùng", badge: "blue" },
  { key: "reserved", name: "Đã giữ cho hồ sơ", badge: "slate" },
  { key: "used", name: "Đã sử dụng", badge: "green" },
  { key: "expired", name: "Hết hạn", badge: "red" },
];

/** 10 lịch sử sử dụng voucher/khuyến mãi: [ngày, mã KM, học viên, khóa, chi nhánh, số tiền giảm]. */
const PM_USAGE_ROWS = [
  ["2026-10-12", "km-19", "Nguyễn Hà Phương Anh", "cr-01", "br-1", 750000],
  ["2026-10-14", "km-19", "Hoàng Mai Anh", "cr-01", "br-1", 750000],
  ["2026-10-19", "km-19", "Võ Hoàng Yến", "cr-01", "br-2", 600000],
  ["2026-10-28", "km-19", "Lý Hải Yến", "cr-07", "br-2", 480000],
  ["2026-10-11", "km-16", "Lê Khánh Chi", "cr-03", "br-2", 960000],
  ["2026-10-12", "km-16", "Đặng Thu Trang", "cr-09", "br-2", 1200000],
  ["2026-09-18", "km-12", "Vũ Đức Minh", "cr-05", "br-1", 2250000],
  ["2026-09-20", "km-12", "Ngô Lan Anh", "cr-02", "br-1", 3000000],
  ["2026-11-01", "km-13", "Võ Hoàng Yến", "cr-01", "br-2", 400000],
  ["2026-08-27", "km-18", "Phan Thanh Tùng", "cr-13", "br-2", 500000],
];

/** 5 hồ sơ học bổng chờ duyệt. */
const PM_SCHOLARSHIP_ROWS = [
  {
    id: "hb-01", student: "Bùi Ngọc Hân", studentCode: "HV0008", promotion: "km-11", branch: "br-1",
    course: "cr-06", requestedAmount: 3000000, reason: "Gia đình khó khăn, điểm đầu vào 8.9", submittedAt: "2026-10-22",
    applicant: "Võ Thị Hồng", approver: "Hiệu trưởng / Chủ tịch hội đồng", status: "pending", note: "",
  },
  {
    id: "hb-02", student: "Đinh Như Ý", studentCode: "HV0018", promotion: "km-11", branch: "br-2",
    course: "cr-06", requestedAmount: 3000000, reason: "Học sinh nghèo vượt khó cấp huyện", submittedAt: "2026-10-23",
    applicant: "Nguyễn Thị Lan", approver: "Hiệu trưởng / Chủ tịch hội đồng", status: "pending", note: "",
  },
  {
    id: "hb-03", student: "Vũ Đức Minh", studentCode: "HV0006", promotion: "km-14", branch: "br-1",
    course: "cr-06", requestedAmount: 1500000, reason: "Học lực Giỏi 2 năm liên tục", submittedAt: "2026-10-26",
    applicant: "Trần Minh Đức", approver: "Ban đào tạo", status: "pending", note: "",
  },
  {
    id: "hb-04", student: "Ngô Lan Anh", studentCode: "HV0010", promotion: "km-12", branch: "br-1",
    course: "cr-02", requestedAmount: 3000000, reason: "Học bổng khuyến học kỳ II", submittedAt: "2026-10-28",
    applicant: "Nguyễn Thị Lan", approver: "Giám đốc trung tâm", status: "pending", note: "",
  },
  {
    id: "hb-05", student: "Mai Tiến Đạt", studentCode: "HV0019", promotion: "km-14", branch: "br-1",
    course: "cr-07", requestedAmount: 1600000, reason: "Điểm trung bình học kỳ 9.1", submittedAt: "2026-10-30",
    applicant: "Trần Minh Đức", approver: "Ban đào tạo", status: "pending", note: "",
  },
];

/** Danh mục người duyệt dùng trong form động nhóm học bổng. */
const PM_APPROVERS = ["Giám đốc trung tâm", "Kế toán trưởng", "Ban đào tạo", "Hiệu trưởng / Chủ tịch hội đồng"];

/** Toàn bộ dữ liệu mẫu, một snapshot duy nhất để store nhân bản khi reset. */
const PM_FIXTURE = {
  version: 1,
  branches: PM_BRANCHES,
  courses: PM_COURSES,
  studentTags: PM_STUDENT_TAGS,
  groups: PM_GROUPS,
  statuses: PM_STATUSES,
  methods: PM_METHODS,
  approvers: PM_APPROVERS,
  students: PM_STUDENTS,
  voucherStatus: PM_VOUCHER_STATUS,
  promotions: PM_PROMOTIONS,
  vouchers: PM_VOUCHER_ROWS.map(([code, promotionId, holder, status, issuedAt, usedAt, amount], index) => ({
    id: `vc-${String(index + 1).padStart(2, "0")}`,
    code,
    promotionId,
    holder,
    status,
    issuedAt,
    usedAt,
    amount,
  })),
  usage: PM_USAGE_ROWS.map(([date, promotionId, student, course, branch, amount], index) => ({
    id: `us-${String(index + 1).padStart(2, "0")}`,
    date,
    promotionId,
    student,
    course,
    branch,
    amount,
    channel: index % 3 === 0 ? "ĐóngOnline" : index % 3 === 1 ? "Quầy thu ngân" : "Zalo OA",
  })),
  scholarships: PM_SCHOLARSHIP_ROWS,
};

if (typeof window !== "undefined") {
  window.STEPS_PROMOTION_FIXTURE = PM_FIXTURE;
  window.PM_FIXTURE = PM_FIXTURE;
}
