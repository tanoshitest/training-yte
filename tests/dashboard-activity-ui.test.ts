import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDashboardActivity() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__dashboardActivityTest = { state, dashboardActivity, attendanceNoticeText, withAttendanceHistory };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/dashboard" },
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
    __dashboardActivityTest: {
      state: Record<string, any>;
      dashboardActivity: (teacherView?: boolean) => string;
      attendanceNoticeText: (session: Record<string, any>, students: Array<Record<string, any>>) => string;
      withAttendanceHistory: (previous: any[], rows: any[], isOff?: boolean) => any[];
    };
  }).__dashboardActivityTest;
}

test("dashboard activity can review past attendance dates but excludes future dates", () => {
  const api = loadDashboardActivity();
  api.state.dashboardDate = "2026-09-09";
  api.state.data = {
    students: [{ id: "student-1", code: "HV0001", fullName: "Học viên 1" }],
    teachers: [{ id: "teacher-1", fullName: "Giáo viên 1" }],
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh 1" }] },
    classes: [{
      id: "class-1",
      name: "Lớp lịch sử",
      status: "ACTIVE",
      branchId: "branch-1",
      teacherId: "teacher-1",
      roomId: "",
      studentIds: ["student-1"],
      schedules: [],
    }, {
      id: "class-unsaved",
      name: "Lớp chưa lưu",
      status: "ACTIVE",
      branchId: "branch-1",
      teacherId: "teacher-1",
      roomId: "",
      studentIds: ["student-1"],
      schedules: [{ weekday: 3, periodId: "period-1", startTime: "19:00", endTime: "21:00" }],
    }],
    lessonSessions: [
      { id: "old-session", classId: "class-1", date: "2026-09-09", startTime: "16:30", endTime: "18:30", teacherId: "teacher-1", status: "COMPLETED", isExtra: true, attendance: [{ studentId: "student-1", status: "PRESENT" }] },
      { id: "today-session", classId: "class-1", date: "2026-09-10", startTime: "16:30", endTime: "18:30", teacherId: "teacher-1", status: "SCHEDULED", isExtra: true, attendance: [] },
      { id: "future-session", classId: "class-1", date: "2999-09-10", startTime: "16:30", endTime: "18:30", teacherId: "teacher-1", status: "SCHEDULED", isExtra: true, attendance: [] },
    ],
  };

  const html = api.dashboardActivity();
  assert.match(html, /<h2>Điểm danh ngày<\/h2><p>09\/09\/2026<\/p>/);
  assert.match(html, /id="dashboard-activity-date"/);
  assert.match(html, /value="2026-09-09" selected>09\/09\/2026<\/option>/);
  assert.match(html, /Lớp lịch sử/);
  assert.match(html, /Đã điểm danh/);
  assert.match(html, /Đã điểm danh 1\/1/);
  assert.match(html, /Lớp chưa lưu/);
  assert.match(html, /Chưa điểm danh/);
  assert.doesNotMatch(html, /2999-09-10/);
});

test("dashboard recurring attendance timeline starts on 1 September 2026", () => {
  const api = loadDashboardActivity();
  api.state.dashboardDate = "2026-09-01";
  api.state.data = {
    students: [],
    teachers: [{ id: "teacher-1", fullName: "Giáo viên" }],
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh" }] },
    classes: [{
      id: "class-1", name: "Lớp đầu tháng", status: "ACTIVE", branchId: "branch-1",
      teacherId: "teacher-1", roomId: "", studentIds: [],
      schedules: [{ weekday: 2, periodId: "p", startTime: "17:00", endTime: "19:00" }],
    }],
    lessonSessions: [],
  };
  const html = api.dashboardActivity();
  assert.match(html, /value="2026-09-01" selected>01\/09\/2026<\/option>/);
  assert.match(html, /Lớp đầu tháng/);
});

test("teacher dashboard lists September attendance days and the same status notices", () => {
  const api = loadDashboardActivity();
  api.state.dashboardDate = "2026-09-01";
  api.state.data = {
    user: { teacherId: "teacher-1", name: "Giáo viên 1" },
    students: [
      { id: "s1", fullName: "An" },
      { id: "s2", fullName: "Ngọc Hân" },
    ],
    teachers: [{ id: "teacher-1", fullName: "Giáo viên 1" }],
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh 1" }] },
    classes: [{
      id: "class-1",
      name: "T9-2015-6.3",
      status: "ACTIVE",
      branchId: "branch-1",
      teacherId: "teacher-1",
      roomId: "",
      studentIds: ["s1", "s2"],
      schedules: [{ weekday: 2, periodId: "p", startTime: "14:30", endTime: "16:30" }],
    }],
    lessonSessions: [{
      id: "marked-session",
      classId: "class-1",
      date: "2026-09-01",
      startTime: "14:30",
      endTime: "16:30",
      teacherId: "teacher-1",
      status: "COMPLETED",
      recurrenceKey: "class-1|2026-09-01|14:30",
      attendance: [
        { studentId: "s1", status: "PRESENT" },
        { studentId: "s2", status: "ABSENT" },
      ],
    }],
  };
  const html = api.dashboardActivity(true);
  assert.match(html, /id="dashboard-activity-date"/);
  assert.match(html, /value="2026-09-01" selected>/);
  assert.match(html, /T9-2015-6\.3/);
  assert.match(html, /Đã điểm danh 1\/2\nVắng không phép: Ngọc Hân/);
  assert.match(html, /class="dashboard-activity-table teacher-task-table"/);
  assert.match(html, /<th>Điểm danh<\/th><th>Thực hiện<\/th>/);
  assert.match(html, /dashboard-attendance-link[^>]*data-nav="\/gv\/lop-hoc\//);
  assert.match(html, /badge badge-green">Đã điểm danh/);
  assert.match(html, /\/gv\/lop-hoc\//);
  assert.doesNotMatch(html, /Task hôm nay/);
});

test("teacher dashboard keeps previous teacher's class attendance history", () => {
  const api = loadDashboardActivity();
  api.state.dashboardDate = "2026-09-06";
  api.state.data = {
    user: { teacherId: "teacher-new", name: "Phan Thị Linh" },
    students: [{ id: "s1", fullName: "An" }],
    teachers: [
      { id: "teacher-huyen", fullName: "Lê Thị Huyền" },
      { id: "teacher-new", fullName: "Phan Thị Linh" },
    ],
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh Thành Sen" }] },
    classes: [{
      id: "class-s31",
      name: "S31- Stepps - Ket 2014",
      status: "ACTIVE",
      branchId: "branch-1",
      teacherId: "teacher-new",
      roomId: "",
      studentIds: ["s1"],
      schedules: [{ weekday: 0, periodId: "p", startTime: "19:15", endTime: "21:15" }],
    }],
    lessonSessions: [{
      id: "old-huyen",
      classId: "class-s31",
      date: "2026-09-06",
      startTime: "19:15",
      endTime: "21:15",
      teacherId: "teacher-huyen",
      status: "COMPLETED",
      recurrenceKey: "class-s31|2026-09-06|19:15",
      attendance: [{ studentId: "s1", status: "PRESENT" }],
    }],
  };
  const html = api.dashboardActivity(true);
  assert.match(html, /value="2026-09-06" selected>/);
  assert.match(html, /S31- Stepps - Ket 2014/);
  assert.match(html, /badge badge-green">Đã điểm danh/);
  assert.match(html, /Đã điểm danh 1\/1/);
  assert.match(html, /Xem lại/);
});

test("first complete attendance shows a full-class notice", () => {
  const api = loadDashboardActivity();
  const students = [
    { id: "s1", fullName: "An" },
    { id: "s2", fullName: "Bình" },
  ];
  const saved = api.withAttendanceHistory([], [
    { studentId: "s1", status: "PRESENT" },
    { studentId: "s2", status: "PRESENT" },
  ]);
  assert.equal(api.attendanceNoticeText({ attendance: saved }, students), "Đã điểm danh 2/2");
});

test("attendance summary separates absence types and only unexcused absence can become late", () => {
  const api = loadDashboardActivity();
  const students = [
    { id: "s1", fullName: "Minh" },
    { id: "s2", fullName: "Ngọc Hân" },
    { id: "s3", fullName: "Lan" },
  ];
  const first = api.withAttendanceHistory([], [
    { studentId: "s1", status: "PRESENT" },
    { studentId: "s2", status: "ABSENT" },
    { studentId: "s3", status: "EXCUSED" },
  ]);
  assert.equal(api.attendanceNoticeText({ attendance: first }, students), "Đã điểm danh 1/3\nVắng không phép: Ngọc Hân\nVắng có phép: Lan");

  const arrived = api.withAttendanceHistory(first, [
    { studentId: "s1", status: "PRESENT" },
    { studentId: "s2", status: "PRESENT" },
    { studentId: "s3", status: "EXCUSED" },
  ]);
  assert.equal(arrived.find((row) => row.studentId === "s2")?.late, true);
  assert.equal(api.attendanceNoticeText({ attendance: arrived }, students), "Đã điểm danh 2/3\nĐi muộn: Ngọc Hân\nVắng có phép: Lan");

  const stillAbsent = api.withAttendanceHistory(first, [
    { studentId: "s1", status: "PRESENT" },
    { studentId: "s2", status: "ABSENT" },
    { studentId: "s3", status: "EXCUSED" },
  ]);
  assert.equal(stillAbsent.find((row) => row.studentId === "s2")?.late, false);
  assert.equal(api.attendanceNoticeText({ attendance: stillAbsent }, students), "Đã điểm danh 1/3\nVắng không phép: Ngọc Hân\nVắng có phép: Lan");

  const excusedArrived = api.withAttendanceHistory(first, [
    { studentId: "s1", status: "PRESENT" },
    { studentId: "s2", status: "ABSENT" },
    { studentId: "s3", status: "PRESENT" },
  ]);
  assert.equal(excusedArrived.find((row) => row.studentId === "s3")?.late, false);
});

test("class-off save does not treat excused rows as the first attendance snapshot", () => {
  const api = loadDashboardActivity();
  const off = api.withAttendanceHistory([], [{ studentId: "s1", status: "EXCUSED" }], true);
  assert.equal(off[0].firstStatus, null);
  const firstReal = api.withAttendanceHistory(off, [{ studentId: "s1", status: "PRESENT" }]);
  assert.equal(firstReal[0].late, false);
  assert.equal(firstReal[0].firstStatus, "PRESENT");
});
