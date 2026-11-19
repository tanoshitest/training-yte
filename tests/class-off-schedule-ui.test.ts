import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadClassOffSchedule() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__classOffTest = { state, classSessions, classMonthScheduleSessions, classCourseScheduleSessions, classOffScheduleConfig, classAttendanceTab, classOffScheduleConfigAt: (cls, courseIndex = 1) => { state.classCourseConfigFor = cls.id; state.classCourseIndex = courseIndex; return classOffScheduleConfig(cls); } };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/lop-hoc/class-1" },
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
    __classOffTest: {
      state: Record<string, any>;
      classSessions: (cls: any) => any[];
      classMonthScheduleSessions: (cls: any, key: string) => any[];
      classCourseScheduleSessions: (cls: any, startDate?: string, sessionCount?: number) => any[];
      classOffScheduleConfig: (cls: any) => string;
      /** Mở panel cấu hình ghim tại khóa `courseIndex` (mặc định khóa 1) — test khóa 1 gọi hàm này vì app mặc định mở khóa đang học. */
      classOffScheduleConfigAt: (cls: any, courseIndex?: number) => string;
      classAttendanceTab: (cls: any, teacherView: boolean, sessionId: string) => string;
    };
  }).__classOffTest;
}

test("class holiday configuration excludes an off day and keeps it in attendance", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-1",
    code: "S1",
    name: "S1-9.1-2012",
    teacherId: "teacher-1",
    roomId: "room-1",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 3, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
    studentIds: ["student-1"],
  };
  const holiday = {
    id: "holiday-2-september",
    classId: cls.id,
    date: "2026-09-02",
    startTime: "17:00",
    endTime: "19:00",
    teacherId: cls.teacherId,
    roomId: cls.roomId,
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: "class-1|2026-09-02|17:00",
    isOff: true,
    offSource: "ADMIN",
    attendance: [],
  };
  ui.state.classOffMonth = "2026-09";
  ui.state.attendanceOff = null;
  ui.state.data = {
    lessonSessions: [holiday],
    students: [{ id: "student-1", code: "HV001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }],
    classes: [cls],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };

  const month = ui.classMonthScheduleSessions(cls, "2026-09");
  assert.equal(month.length, 9);
  assert.equal(month.filter((row) => row.isOff).length, 1);
  assert.equal(month.find((row) => row.date === "2026-09-02")?.id, holiday.id);

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /Cấu hình lịch nghỉ/);
  assert.match(config, /data-off-total>9 buổi/);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>8 buổi/);
  assert.match(config, /data-billable-amount>400\.000\s₫/);
  assert.match(config, /value="class-1\|2026-09-02\|17:00" checked/);

  const allSessions = ui.classSessions(cls);
  assert.ok(allSessions.some((row) => row.id === holiday.id), "the configured pre-window holiday remains selectable");
  const attendance = ui.classAttendanceTab(cls, false, holiday.id);
  assert.match(attendance, /Nghỉ do học vụ cấu hình · Đã khóa/);
  assert.match(attendance, /id="attendance-off" checked disabled/);
  assert.match(attendance, /02\/09.*· Nghỉ \(đã khóa\)/);
  assert.match(attendance, /type="submit" disabled/);
});

test("teacher-selected class off remains editable and does not look admin-locked", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-1", code: "S1", name: "S1", teacherId: "teacher-1", roomId: "",
    billingMode: "MONTHLY", sessionPrice: 50_000, studentIds: [],
    schedules: [{ weekday: 3, startTime: "17:00", endTime: "19:00" }],
  };
  const teacherOff = {
    id: "teacher-off", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-1|2026-09-09|17:00", isOff: true, offSource: "TEACHER", attendance: [],
  };
  ui.state.classOffMonth = "2026-09";
  ui.state.attendanceOff = null;
  ui.state.data = { lessonSessions: [teacherOff], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };
  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /GV cho nghỉ/);
  assert.doesNotMatch(config, /value="class-1\|2026-09-09\|17:00" checked/);
  const attendance = ui.classAttendanceTab(cls, true, teacherOff.id);
  assert.match(attendance, /Giáo viên cho nghỉ · Có thể sửa/);
  assert.match(attendance, /id="attendance-off" checked \/>/);
  assert.doesNotMatch(attendance, /id="attendance-off" checked disabled/);
  assert.doesNotMatch(attendance, /type="submit" disabled/);
});

test("course configuration generates the exact course sequence and excludes planned holidays", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-course", code: "K24", name: "Khóa 4 buổi", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-01", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
  };
  const holiday = {
    id: "course-holiday", classId: cls.id, date: "2026-09-05", startTime: "09:00", endTime: "11:00",
    teacherId: cls.teacherId, roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-course|2026-09-05|09:00", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.deepEqual(Array.from(sessions, (row: any) => row.date), ["2026-09-01", "2026-09-05", "2026-09-08", "2026-09-12"]);
  assert.equal(sessions[1].id, holiday.id);

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /Cấu hình lịch khóa/);
  assert.match(config, /id="class-course-start"[^>]*value="2026-09-01"/);
  assert.match(config, /id="class-course-session-count"[^>]*value="4"/);
  assert.match(config, /data-off-total>4 buổi/);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>3 buổi/);
  assert.match(config, /data-billable-amount>300\.000\s₫/);
  assert.match(config, /Lưu cấu hình khóa/);
});

test("migrated S12 course labels 04/09/2026 as session 15", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s12", code: "S12", name: "S12- 4.1- 2017 NHÓM 1", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-17", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "17:00", endTime: "19:00" },
      { weekday: 0, startTime: "07:15", endTime: "09:15" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[14].date, "2026-09-04");
  assert.equal(sessions[23].date, "2026-10-04");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /<th>Tên buổi<\/th><th>Ngày học<\/th>/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 15<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S13 course keeps 06/09/2026 as session 14 around the admin holiday", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s13", code: "S13", name: "s13-4.2-2017 nhóm 2", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-21", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:00", endTime: "19:00" },
      { weekday: 0, startTime: "15:00", endTime: "17:00" },
    ],
  };
  const holiday = {
    id: "s13-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s13|2026-09-01|17:00", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-01");
  assert.equal(sessions[12].isOff, true);
  assert.equal(sessions[13].date, "2026-09-06");
  assert.equal(sessions[23].date, "2026-10-11");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 14<\/td>\s*<td><strong>06\/09\/2026<\/strong><\/td>/);
});

test("course list still shows the teacher-off day inside the course window", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s14", code: "S14", name: "s14- FLYERS VIP 2017", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-07-05", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "19:15", endTime: "21:15" },
      { weekday: 0, startTime: "09:00", endTime: "11:00" },
    ],
  };
  const off = {
    id: "s14-teacher-off", classId: cls.id, date: "2026-09-25", startTime: "19:15", endTime: "21:15",
    teacherId: cls.teacherId, roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-import-s14|2026-09-25|19:15", isOff: true, offSource: "TEACHER", attendance: [],
  };
  ui.state.data = { lessonSessions: [off], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  // Suất nghỉ không chiếm vị trí: buổi 24 là 27/09 thay vì 25/09 — khóa tự dài ra.
  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[23].date, "2026-09-27");

  // Nhưng buổi nghỉ vẫn hiển thị trong danh sách khóa, không đánh số "Buổi N".
  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-total>24 buổi/);
  assert.match(config, /data-billable-count>24 buổi/);
  assert.match(config, /class-session-name">—<\/td>\s*<td><strong>25\/09\/2026<\/strong><\/td>/);
  assert.match(config, /GV cho nghỉ/);
  // Buổi 24 (27/09) vẫn đánh số đúng sau dòng nghỉ.
  assert.match(config, /<td class="cell-index class-session-name">Buổi 24<\/td>\s*<td><strong>27\/09\/2026<\/strong><\/td>/);
});

test("migrated S14 course labels 04/09/2026 as session 18", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s14", code: "S14", name: "s14- FLYERS VIP 2017", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-07-05", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "19:15", endTime: "21:15" },
      { weekday: 0, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[17].date, "2026-09-04");
  assert.equal(sessions[23].date, "2026-09-25");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 18<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S15 course keeps session 6 off and labels 05/09/2026 as session 7", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s15", code: "S15", name: "s15- movers vip 2017", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-08-15", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "19:15", endTime: "21:15" },
      { weekday: 6, startTime: "19:15", endTime: "21:15" },
    ],
  };
  const holiday = {
    id: "s15-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "19:15", endTime: "21:15",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s15|2026-09-01|19:15", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[5].date, "2026-09-01");
  assert.equal(sessions[5].isOff, true);
  assert.equal(sessions[6].date, "2026-09-05");
  assert.equal(sessions[23].date, "2026-11-03");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 7<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("new S16 ten-session course starts with session 1 on 10/09/2026", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s16", code: "S16", name: "S16- MOVER KÈM", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 160_000, courseSessions: 10, courseStartDate: "2026-09-10", studentIds: [],
    schedules: [
      { weekday: 1, startTime: "19:00", endTime: "20:30" },
      { weekday: 4, startTime: "17:30", endTime: "19:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 10);
  assert.equal(sessions[0].date, "2026-09-10");
  assert.equal(sessions[9].date, "2026-10-12");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-total>10 buổi/);
  assert.match(config, /data-billable-count>10 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 1<\/td>\s*<td><strong>10\/09\/2026<\/strong><\/td>/);
});

test("migrated S17 course keeps session 5 off and labels 05/09/2026 as session 6", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s17", code: "S17", name: "s17-2.2- 2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-18", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:15", endTime: "18:45" },
      { weekday: 6, startTime: "17:00", endTime: "18:30" },
    ],
  };
  const holiday = {
    id: "s17-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "17:15", endTime: "18:45",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s17|2026-09-01|17:15", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[4].date, "2026-09-01");
  assert.equal(sessions[4].isOff, true);
  assert.equal(sessions[5].date, "2026-09-05");
  assert.equal(sessions[23].date, "2026-11-07");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 6<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S18 course keeps session 5 off and labels 06/09/2026 as session 6", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s18", code: "S18", name: "s18-2.3-2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-19", studentIds: [],
    schedules: [
      { weekday: 3, startTime: "17:30", endTime: "19:00" },
      { weekday: 0, startTime: "08:00", endTime: "09:30" },
    ],
  };
  const holiday = {
    id: "s18-admin-holiday", classId: cls.id, date: "2026-09-02", startTime: "17:30", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s18|2026-09-02|17:30", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[4].date, "2026-09-02");
  assert.equal(sessions[4].isOff, true);
  assert.equal(sessions[5].date, "2026-09-06");
  assert.equal(sessions[23].date, "2026-11-08");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 6<\/td>\s*<td><strong>06\/09\/2026<\/strong><\/td>/);
});

test("new S19 twenty-session course starts with session 1 on 17/09/2026", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s19", code: "S19", name: "s19- 2020-1.5", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 20, courseStartDate: "2026-09-17", studentIds: [],
    schedules: [
      { weekday: 4, startTime: "17:30", endTime: "19:00" },
      { weekday: 0, startTime: "15:00", endTime: "16:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 20);
  assert.equal(sessions[0].date, "2026-09-17");
  assert.equal(sessions[19].date, "2026-11-22");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-total>20 buổi/);
  assert.match(config, /data-billable-count>20 buổi/);
  assert.match(config, /data-billable-amount>1\.300\.000[\s\u00a0]+₫/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 1<\/td>\s*<td><strong>17\/09\/2026<\/strong><\/td>/);
});

test("migrated S20 course keeps session 10 off and labels 05/09/2026 as session 11", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s20", code: "S20", name: "s20-2.5-2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-01", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "19:00", endTime: "20:30" },
      { weekday: 6, startTime: "19:00", endTime: "20:30" },
    ],
  };
  const holiday = {
    id: "s20-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "19:00", endTime: "20:30",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s20|2026-09-01|19:00", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[9].date, "2026-09-01");
  assert.equal(sessions[9].isOff, true);
  assert.equal(sessions[10].date, "2026-09-05");
  assert.equal(sessions[23].date, "2026-10-20");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 11<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S21 course labels 03/09/2026 as session 10", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s21", code: "S21", name: "S21-2.6-2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-03", studentIds: [],
    schedules: [
      { weekday: 1, startTime: "17:30", endTime: "19:00" },
      { weekday: 4, startTime: "17:30", endTime: "19:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[9].date, "2026-09-03");
  assert.equal(sessions[23].date, "2026-10-22");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 buổi/);
  assert.match(config, /data-billable-count>24 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 10<\/td>\s*<td><strong>03\/09\/2026<\/strong><\/td>/);
});

test("new S28 twenty-four-session course starts with session 1 on 10/09/2026", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s28", code: "S28", name: "S28- 5.3-2016", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 69_000, courseSessions: 24, courseStartDate: "2026-09-10", studentIds: [],
    schedules: [
      { weekday: 4, startTime: "17:15", endTime: "19:15" },
      { weekday: 0, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[0].date, "2026-09-10");
  assert.equal(sessions[0].startTime, "17:15");
  assert.equal(sessions[1].date, "2026-09-13");
  assert.equal(sessions[1].startTime, "09:00");
  assert.doesNotMatch(sessions.map((row) => row.date).join(","), /2026-09-03|2026-09-06|2026-09-08/);

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /id="class-course-start"[^>]*value="2026-09-10"/);
  assert.match(config, /data-billable-count>24 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 1<\/td>\s*<td><strong>10\/09\/2026<\/strong><\/td>/);
});

test("new S22 twenty-four-session course starts with session 1 on 08/09/2026", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s22", code: "S22", name: "s22- movers vip 1 -2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 145_000, courseSessions: 24, courseStartDate: "2026-09-08", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "19:00", endTime: "21:00" },
      { weekday: 5, startTime: "19:00", endTime: "21:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[0].date, "2026-09-08");
  assert.equal(sessions[1].date, "2026-09-11");
  assert.equal(sessions[23].date, "2026-11-27");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 buổi/);
  assert.match(config, /data-billable-count>24 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 1<\/td>\s*<td><strong>08\/09\/2026<\/strong><\/td>/);
});

test("migrated S23 course keeps session 19 off and labels 05/09/2026 as session 20", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s23", code: "S23", name: "S23- MOVERS VIP 2-2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-07-01", studentIds: [],
    schedules: [
      { weekday: 3, startTime: "19:15", endTime: "21:15" },
      { weekday: 6, startTime: "15:00", endTime: "17:00" },
    ],
  };
  const holiday = {
    id: "s23-admin-holiday", classId: cls.id, date: "2026-09-02", startTime: "19:15", endTime: "21:15",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s23|2026-09-02|19:15", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[18].date, "2026-09-02");
  assert.equal(sessions[18].isOff, true);
  assert.equal(sessions[19].date, "2026-09-05");
  assert.equal(sessions[20].date, "2026-09-09");
  assert.equal(sessions[23].date, "2026-09-19");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 20<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S24 course keeps session 12 off and labels 05/09/2026 as session 13", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s24", code: "S24", name: "S24- NHÓM 1- 2019-2.1", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-25", studentIds: [],
    schedules: [
      { weekday: 3, startTime: "17:30", endTime: "19:00" },
      { weekday: 6, startTime: "14:00", endTime: "16:00" },
    ],
  };
  const holiday = {
    id: "s24-admin-holiday", classId: cls.id, date: "2026-09-02", startTime: "17:30", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s24|2026-09-02|17:30", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[11].date, "2026-09-02");
  assert.equal(sessions[11].isOff, true);
  assert.equal(sessions[12].date, "2026-09-05");
  assert.equal(sessions[13].date, "2026-09-09");
  assert.equal(sessions[14].date, "2026-09-12");
  assert.equal(sessions[23].date, "2026-10-14");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 buổi/);
  assert.match(config, /data-billable-count>23 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 13<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S25 course labels 05/09/2026 as session 17", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s25", code: "S25", name: "S25 2019 Vip 1 MOVERS", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-07-11", studentIds: [],
    schedules: [
      { weekday: 1, startTime: "17:30", endTime: "19:00" },
      { weekday: 6, startTime: "17:00", endTime: "18:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[16].date, "2026-09-05");
  assert.equal(sessions[23].date, "2026-09-28");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 17<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S26 course labels 05/09/2026 as session 13", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s26", code: "S26", name: "S26-NHÓM 2 -2019-2.2", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-25", studentIds: [],
    schedules: [
      { weekday: 1, startTime: "17:30", endTime: "19:00" },
      { weekday: 6, startTime: "19:00", endTime: "20:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-05");
  assert.equal(sessions[13].date, "2026-09-07");
  assert.equal(sessions[23].date, "2026-10-12");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 buổi/);
  assert.match(config, /data-billable-count>24 buổi/);
  assert.match(config, /<td class="cell-index class-session-name">Buổi 13<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S27 course labels 04/09/2026 as session 13", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s27", code: "S27", name: "S27 group 3 2019-2.3", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-24", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "14:30", endTime: "16:00" },
      { weekday: 1, startTime: "19:00", endTime: "20:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-04");
  assert.equal(sessions[13].date, "2026-09-07");
  assert.equal(sessions[14].date, "2026-09-11");
  assert.equal(sessions[23].date, "2026-10-12");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 13<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S29 course keeps session 12 off and labels 04/09/2026 as session 13", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s29", code: "S29", name: "S29 group 3 2017-4.3", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-24", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "19:15", endTime: "21:15" },
      { weekday: 5, startTime: "15:00", endTime: "17:00" },
    ],
  };
  const holiday = {
    id: "s29-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "19:15", endTime: "21:15",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s29|2026-09-01|19:15", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[11].date, "2026-09-01");
  assert.equal(sessions[11].isOff, true);
  assert.equal(sessions[12].date, "2026-09-04");
  assert.equal(sessions[13].date, "2026-09-08");
  assert.equal(sessions[14].date, "2026-09-11");
  assert.equal(sessions[23].date, "2026-10-13");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 bu\u1ed5i/);
  assert.match(config, /data-billable-count>23 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 13<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S30 course labels 03/09/2026 as session 13", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s30", code: "S30", name: "S30 MOVERS VIP 2019", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 145_000, courseSessions: 24, courseStartDate: "2026-07-23", studentIds: [],
    schedules: [
      { weekday: 4, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-03");
  assert.equal(sessions[13].date, "2026-09-05");
  assert.equal(sessions[14].date, "2026-09-10");
  assert.equal(sessions[15].date, "2026-09-12");
  assert.equal(sessions[23].date, "2026-10-10");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 13<\/td>\s*<td><strong>03\/09\/2026<\/strong><\/td>/);
});

test("migrated S32 course labels 04/09/2026 as session 8", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s32", code: "S32", name: "S32 Vip 3 - 2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-08-09", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "15:15", endTime: "19:15" },
      { weekday: 0, startTime: "15:15", endTime: "19:15" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[7].date, "2026-09-04");
  assert.equal(sessions[8].date, "2026-09-06");
  assert.equal(sessions[9].date, "2026-09-11");
  assert.equal(sessions[23].date, "2026-10-30");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 8<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S33 course labels 04/09/2026 as session 8", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s33", code: "S33", name: "S33 Vip 4 - 2018", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-08-09", studentIds: [],
    schedules: [
      { weekday: 5, startTime: "19:15", endTime: "21:15" },
      { weekday: 0, startTime: "19:15", endTime: "21:15" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[7].date, "2026-09-04");
  assert.equal(sessions[8].date, "2026-09-06");
  assert.equal(sessions[9].date, "2026-09-11");
  assert.equal(sessions[23].date, "2026-10-30");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 8<\/td>\s*<td><strong>04\/09\/2026<\/strong><\/td>/);
});

test("migrated S34 course labels 06/09/2026 as session 14", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s34", code: "S34", name: "S34- NHÓM 4-2019- 2.4", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-23", studentIds: [],
    schedules: [
      { weekday: 4, startTime: "19:00", endTime: "20:30" },
      { weekday: 0, startTime: "19:00", endTime: "20:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-03");
  assert.equal(sessions[13].date, "2026-09-06");
  assert.equal(sessions[14].date, "2026-09-10");
  assert.equal(sessions[23].date, "2026-10-11");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 14<\/td>\s*<td><strong>06\/09\/2026<\/strong><\/td>/);
});

test("migrated S35 course keeps session 10 off and labels 06/09/2026 as session 11", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s35", code: "S35", name: "s35- nhóm 1-2020-1.2", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-02", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:30", endTime: "19:00" },
      { weekday: 0, startTime: "08:00", endTime: "09:30" },
    ],
  };
  const holiday = {
    id: "s35-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "17:30", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s35|2026-09-01|17:30", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[9].date, "2026-09-01");
  assert.equal(sessions[9].isOff, true);
  assert.equal(sessions[10].date, "2026-09-06");
  assert.equal(sessions[11].date, "2026-09-08");
  assert.equal(sessions[23].date, "2026-10-20");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 bu\u1ed5i/);
  assert.match(config, /data-billable-count>23 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 11<\/td>\s*<td><strong>06\/09\/2026<\/strong><\/td>/);
});

test("migrated S36 course labels 05/09/2026 as session 11", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s36", code: "S36", name: "s36-nhóm 2- 2020-1.2", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-01", studentIds: [],
    schedules: [
      { weekday: 4, startTime: "17:30", endTime: "19:00" },
      { weekday: 6, startTime: "16:00", endTime: "17:30" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[9].date, "2026-09-03");
  assert.equal(sessions[10].date, "2026-09-05");
  assert.equal(sessions[11].date, "2026-09-10");
  assert.equal(sessions[23].date, "2026-10-22");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 11<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S42 course keeps session 9 off and labels 05/09/2026 as session 10", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s42", code: "S42", name: "S42 - 2020 CAMBRIDGE STARTERS", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-08-04", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "19:15", endTime: "20:45" },
      { weekday: 6, startTime: "17:30", endTime: "19:00" },
    ],
  };
  const holiday = {
    id: "s42-admin-holiday", classId: cls.id, date: "2026-09-01", startTime: "19:15", endTime: "20:45",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-import-s42|2026-09-01|19:15", isOff: true, offSource: "ADMIN", attendance: [],
  };
  ui.state.data = { lessonSessions: [holiday], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[8].date, "2026-09-01");
  assert.equal(sessions[8].isOff, true);
  assert.equal(sessions[9].date, "2026-09-05");
  assert.equal(sessions[10].date, "2026-09-08");
  assert.equal(sessions[11].date, "2026-09-12");
  assert.equal(sessions[23].date, "2026-10-24");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>1 bu\u1ed5i/);
  assert.match(config, /data-billable-count>23 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 10<\/td>\s*<td><strong>05\/09\/2026<\/strong><\/td>/);
});

test("migrated S40 course labels 07/09/2026 as session 14", () => {
  const ui = loadClassOffSchedule();
  const cls = {
    id: "class-import-s40", code: "S40", name: "s40-2019-1.7", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-07-25", studentIds: [],
    schedules: [
      { weekday: 1, startTime: "19:00", endTime: "20:30" },
      { weekday: 6, startTime: "07:30", endTime: "09:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };

  const sessions = ui.classCourseScheduleSessions(cls);
  assert.equal(sessions.length, 24);
  assert.equal(sessions[12].date, "2026-09-05");
  assert.equal(sessions[13].date, "2026-09-07");
  assert.equal(sessions[14].date, "2026-09-12");
  assert.equal(sessions[23].date, "2026-10-12");

  const config = ui.classOffScheduleConfigAt(cls);
  assert.match(config, /data-off-count>0 bu\u1ed5i/);
  assert.match(config, /data-billable-count>24 bu\u1ed5i/);
  assert.match(config, /<td class="cell-index class-session-name">Bu\u1ed5i 14<\/td>\s*<td><strong>07\/09\/2026<\/strong><\/td>/);
});

test("class info page fits one screen and the timetable takes the leftover height", () => {
  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  // Trang không cuộn: chỉ cột trái tự cuộn, cột phải cao hết chỗ còn lại.
  assert.match(styles, /\.class-info-content \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  assert.match(styles, /\.class-info-content \{[^}]*grid-template-columns: minmax\(0,1fr\) minmax\(520px,1fr\)/);
  assert.match(styles, /\.class-info-column \{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*scrollbar-gutter: stable/);
  assert.match(styles, /\.class-info-card > form \{[^}]*display: block;[^}]*height: auto/);
  assert.match(styles, /\.class-info-card \.nz-class-split \{[^}]*overflow: visible/);
  assert.match(styles, /\.class-info-card \{[^}]*min-height: min-content/);
  assert.match(styles, /\.class-info-card \.nz-class-fields \{ grid-template-columns: repeat\(3,/);
  assert.match(styles, /\.class-info-card \.nz-schedule-head \.schedule-builder \{[^}]*grid-template-columns: 92px minmax\(0,1fr\) auto/);
  assert.match(styles, /\.class-off-summary \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(4,/);
  assert.match(styles, /\.class-off-card form\[data-mode="COURSE"\] \.class-off-head \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /\.class-course-config-fields \{[^}]*width: 100%;[^}]*grid-template-columns:/);
  assert.match(styles, /\.class-config-column \{[^}]*display: flex;[^}]*min-height: 0;[^}]*flex-direction: column/);
  assert.match(styles, /\.class-off-card \{[^}]*min-height: 0;[^}]*flex: 1/);
  assert.match(styles, /\.class-off-card > form \{[^}]*grid-template-rows: auto auto minmax\(0,1fr\) auto auto/);
  assert.match(styles, /\.class-off-table \{[^}]*min-height: 0;[^}]*overflow-y: auto/);
  assert.doesNotMatch(styles, /\.class-off-table \{[^}]*max-height: 238px/);
  assert.match(styles, /\.class-off-table table \{[^}]*table-layout: fixed/);
  assert.match(styles, /\.class-off-table thead \{ position: sticky;/);
  assert.match(styles, /\.class-off-table tr\.is-off td \{ background: #fffbeb;/);
  // Cột trái xếp dọc: thông tin lớp, lịch học rồi phiếu báo học phí.
  assert.match(styles, /\.class-info-card \.nz-class-split \{[^}]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(styles, /\.class-info-head \{[^}]*align-items: center;[^}]*justify-content: space-between/);
  assert.match(styles, /\.class-tuition-notice-controls \{[^}]*grid-template-columns: minmax\(0,1fr\) 130px/);
  assert.match(styles, /\.class-tuition-notice-card \.primary-btn \{[^}]*width: 100%/);
  assert.match(styles, /\.schedule-list\.compact li \{ grid-template-columns: 54px minmax\(0,1fr\) 28px/);
  assert.doesNotMatch(styles, /\.class-tuition-notice-card \.class-tuition-student/);
  assert.match(app, /class="class-info-column"[\s\S]*classTuitionNoticePanel\(row\)/);
  assert.match(app, /class="class-config-column">\$\{classOffScheduleConfig\(row, readOnly\)\}<\/div>/);
  assert.match(styles, /@media \(max-width: 1250px\)[\s\S]*\.class-info-content \{ grid-template-columns: 1fr;[^}]*overflow-y: auto/);
  assert.match(app, /<th>Tên buổi<\/th><th>Ngày học<\/th>/);
  assert.match(styles, /\.class-off-table th:nth-child\(2\),\s*\.class-off-table td:nth-child\(2\) \{ width: 36px; text-align: center; white-space: nowrap; \}/);
  assert.match(styles, /\.class-off-table th:nth-child\(4\),\s*\.class-off-table td:nth-child\(4\) \{ width: 88px; \}/);
  assert.doesNotMatch(styles, /\.class-off-table th:nth-child\(4\),\s*\.class-off-table td:nth-child\(4\) \{ display: none/);
  assert.doesNotMatch(styles, /\.class-off-table th:nth-child\(2\),\s*\.class-off-table td:nth-child\(2\),/);
});
