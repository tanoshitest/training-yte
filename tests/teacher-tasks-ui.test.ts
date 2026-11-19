import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadTeacherTasks() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__teacherTasksTest = { state, teacherTasksPage, teacherAttendanceTasks, teacherIncompleteAttendanceTasks, teacherTaskFilter, adminShell, adminPageTitle };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/gv/task" },
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
    __teacherTasksTest: {
      state: Record<string, any>;
      teacherTaskFilter: () => string;
      teacherTasksPage: () => string;
      teacherAttendanceTasks: () => Array<Record<string, any>>;
      teacherIncompleteAttendanceTasks: () => Array<Record<string, any>>;
      adminShell: (content: string, teacher?: boolean) => string;
      adminPageTitle: (teacher?: boolean) => string;
    };
  }).__teacherTasksTest;
}

function seedTeacher(ui: ReturnType<typeof loadTeacherTasks>) {
  ui.state.role = "TEACHER";
  ui.state.route = "/gv/task";
  ui.state.data = {
    user: { teacherId: "teacher-1", name: "Dương Thị Vân", email: "van@steps.vn" },
    students: [
      { id: "s1", fullName: "An" },
      { id: "s2", fullName: "Bình" },
    ],
    teachers: [{ id: "teacher-1", fullName: "Dương Thị Vân", email: "van@steps.vn" }],
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh Thạch Khê" }], rooms: [], classTypes: [], lessonPeriods: [] },
    classes: [{
      id: "class-t1",
      code: "T1",
      name: "T1-2012-9.1",
      status: "ACTIVE",
      branchId: "branch-1",
      teacherId: "teacher-1",
      roomId: "",
      studentIds: ["s1", "s2"],
      schedules: [{ weekday: 2, periodId: "p", startTime: "16:30", endTime: "18:30" }],
    }],
    lessonSessions: [{
      id: "marked-session",
      classId: "class-t1",
      date: "2026-09-08",
      startTime: "16:30",
      endTime: "18:30",
      teacherId: "teacher-1",
      status: "COMPLETED",
      recurrenceKey: "class-t1|2026-09-08|16:30",
      attendance: [{ studentId: "s1", status: "PRESENT" }],
    }, {
      id: "off-session",
      classId: "class-t1",
      date: "2026-09-01",
      startTime: "19:00",
      endTime: "21:00",
      teacherId: "teacher-1",
      status: "CANCELLED",
      isExtra: true,
      isOff: true,
      offSource: "TEACHER",
      recurrenceKey: "class-t1|2026-09-01|19:00",
      attendance: [],
    }, {
      id: "future-session",
      classId: "class-t1",
      date: "2999-09-10",
      startTime: "16:30",
      endTime: "18:30",
      teacherId: "teacher-1",
      status: "SCHEDULED",
      isExtra: true,
      attendance: [],
    }],
  };
}

test("teacher sidebar lists Task của tôi under Lớp của tôi", () => {
  const ui = loadTeacherTasks();
  seedTeacher(ui);
  const html = ui.adminShell("content", true);
  assert.match(html, /data-nav="\/gv\/lop-hoc"/);
  assert.match(html, /data-nav="\/gv\/task"/);
  assert.match(html, /Task của tôi/);
  ui.state.route = "/gv/task";
  assert.equal(ui.adminPageTitle(true), "Task của tôi");
});

test("teacher tasks list every past and today session and open that exact session", () => {
  const ui = loadTeacherTasks();
  seedTeacher(ui);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const all = ui.teacherAttendanceTasks();
  const open = ui.teacherIncompleteAttendanceTasks();
  assert.equal(ui.state.teacherTaskFilter, "open");
  assert.equal(ui.teacherTaskFilter(), "open");
  assert.ok(all.some((row) => row.session.date === "2026-09-01" && row.session.startTime === "16:30" && !row.marked));
  assert.ok(all.some((row) => row.session.date === "2026-09-08" && row.marked));
  assert.ok(all.every((row) => row.session.date >= "2026-09-01" && row.session.date <= todayKey));
  assert.ok(all.every((row) => !row.session.isOff));
  assert.ok(open.every((row) => !row.marked));
  assert.ok(!all.some((row) => row.session.id === "off-session" || row.session.startTime === "19:00"));
  assert.ok(!all.some((row) => row.session.date.startsWith("2999")));

  const openHtml = ui.teacherTasksPage();
  assert.match(openHtml, /<h1>Task của tôi<\/h1>/);
  assert.match(openHtml, /id="teacher-task-filter"/);
  assert.match(openHtml, /option value="open" selected>Chưa hoàn thành/);
  assert.match(openHtml, /T1-2012-9\.1/);
  assert.match(openHtml, /T3 01\/09\/2026/);
  assert.match(openHtml, /badge badge-slate">Chưa hoàn thành/);
  assert.match(openHtml, /data-nav="\/gv\/lop-hoc\/class-t1\/diem-danh\/recurring%7Cclass-t1%7C2026-09-01%7C16%3A30"/);
  assert.match(openHtml, />Điểm danh<\/button>/);
  assert.doesNotMatch(openHtml, /08\/09\/2026/);
  assert.doesNotMatch(openHtml, /badge badge-green">Đã hoàn thành/);
  assert.doesNotMatch(openHtml, /2999/);

  ui.state.teacherTaskFilter = "done";
  const doneHtml = ui.teacherTasksPage();
  assert.match(doneHtml, /T3 08\/09\/2026/);
  assert.match(doneHtml, /badge badge-green">Đã hoàn thành/);
  assert.match(doneHtml, /data-nav="\/gv\/lop-hoc\/class-t1\/diem-danh\/marked-session"/);
  assert.match(doneHtml, />Xem lại<\/button>/);
  assert.doesNotMatch(doneHtml, /01\/09\/2026/);

  ui.state.teacherTaskFilter = "all";
  const allHtml = ui.teacherTasksPage();
  assert.match(allHtml, /01\/09\/2026/);
  assert.match(allHtml, /08\/09\/2026/);
});
