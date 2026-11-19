import type {
  DemoAttendanceRow,
  DemoAttendanceStatus,
  DemoHomeworkRating,
  DemoLessonRating,
  DemoLessonSession,
} from "../operations-types";
import type { BlockRepository } from "./block-repository";
import { groupBy, mapOf, rowsOf } from "./relational-read";
import { syncTables, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

/**
 * Điểm do giáo viên tự đặt là chuỗi tự do. Dữ liệu cũ có thể còn giá trị số;
 * chuyển thành chuỗi ở đây sẽ làm lệch bản dựng lại nên báo lỗi thay vì chuyển ngầm.
 */
function scoreText(value: unknown, where: string) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error(`Giá trị điểm không phải chuỗi tại ${where}: ${JSON.stringify(value)}`);
}

interface SessionRow {
  id: string;
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  roomId: string;
  status: DemoLessonSession["status"];
  isExtra: boolean;
  recurrenceKey: string;
  note: string;
  isOff: boolean;
  offSource: "ADMIN" | "TEACHER" | null;
  noFee: boolean;
  makeupOf: string | null;
  hasHomework: boolean;
}

interface AssessmentColumnRow { sessionId: string; columnId: string; name: string }
interface AttendanceColumnRow { sessionId: string; columnKey: string }
interface AttendanceRow {
  sessionId: string;
  studentId: string;
  status: DemoAttendanceStatus | null;
  firstStatus: DemoAttendanceStatus | null;
  late: boolean;
  lessonRating: DemoLessonRating | null;
  homeworkRating: DemoHomeworkRating | null;
  pronunciationVideoDone: boolean;
  worksheetDone: boolean;
  vocabularyScore: string | null;
  note: string;
}
interface AttendanceScoreRow { sessionId: string; studentId: string; columnId: string; value: string }

interface SessionsQuery {
  sessions: SessionRow[] | null;
  assessmentColumns: AssessmentColumnRow[] | null;
  columnOrder: AttendanceColumnRow[] | null;
  attendance: AttendanceRow[] | null;
  scores: AttendanceScoreRow[] | null;
}

export const sessionsRepository: BlockRepository<DemoLessonSession[]> = {
  key: "sessions:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<SessionsQuery[]>`
      SELECT
        (SELECT json_agg(s ORDER BY s.position) FROM lesson_sessions s) AS sessions,
        (SELECT json_agg(c ORDER BY c."sessionId", c.position) FROM session_assessment_columns c) AS "assessmentColumns",
        (SELECT json_agg(c ORDER BY c."sessionId", c.position) FROM session_attendance_columns c) AS "columnOrder",
        (SELECT json_agg(a ORDER BY a."sessionId", a.position) FROM attendances a) AS attendance,
        (SELECT json_agg(s ORDER BY s."sessionId", s."studentId", s.position) FROM attendance_scores s) AS scores
    `;
    const assessmentColumns = groupBy(rowsOf<AssessmentColumnRow>(result.assessmentColumns), (row) => row.sessionId);
    const columnOrder = groupBy(rowsOf<AttendanceColumnRow>(result.columnOrder), (row) => row.sessionId);
    const attendance = groupBy(rowsOf<AttendanceRow>(result.attendance), (row) => row.sessionId);
    const scores = groupBy(rowsOf<AttendanceScoreRow>(result.scores), (row) => `${row.sessionId}\u0000${row.studentId}`);

    return rowsOf<SessionRow>(result.sessions).map((row): DemoLessonSession => ({
      id: row.id,
      classId: row.classId,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      teacherId: row.teacherId,
      roomId: row.roomId,
      status: row.status,
      isExtra: row.isExtra,
      recurrenceKey: row.recurrenceKey,
      note: row.note,
      isOff: row.isOff,
      ...(row.offSource === null ? {} : { offSource: row.offSource }),
      noFee: row.noFee === true,
      ...(row.makeupOf === null ? {} : { makeupOf: row.makeupOf }),
      hasHomework: row.hasHomework,
      assessmentColumns: (assessmentColumns.get(row.id) ?? []).map((column) => ({ id: column.columnId, name: column.name })),
      attendanceColumnOrder: (columnOrder.get(row.id) ?? []).map((column) => column.columnKey),
      attendance: (attendance.get(row.id) ?? []).map((item): DemoAttendanceRow => ({
        studentId: item.studentId,
        status: item.status,
        firstStatus: item.firstStatus,
        late: item.late,
        lessonRating: item.lessonRating,
        homeworkRating: item.homeworkRating,
        pronunciationVideoDone: item.pronunciationVideoDone,
        worksheetDone: item.worksheetDone,
        vocabularyScore: item.vocabularyScore,
        assessmentScores: mapOf(scores.get(`${row.id}\u0000${item.studentId}`), (score) => score.columnId, (score) => score.value),
        note: item.note,
      })),
    }));
  },

  async write(tx: TxClient, value: DemoLessonSession[]) {
    const sessions: Row[] = [];
    const columns: Row[] = [];
    const columnOrder: Row[] = [];
    const attendance: Row[] = [];
    const scores: Row[] = [];

    value.forEach((row, position) => {
      sessions.push({
        id: row.id,
        position,
        classId: text(row.classId),
        date: text(row.date),
        startTime: text(row.startTime),
        endTime: text(row.endTime),
        teacherId: text(row.teacherId),
        roomId: text(row.roomId),
        status: text(row.status),
        isExtra: row.isExtra === true,
        recurrenceKey: text(row.recurrenceKey),
        note: text(row.note),
        isOff: row.isOff === true,
        offSource: optionalText(row.offSource),
        noFee: row.noFee === true,
        makeupOf: optionalText(row.makeupOf),
        hasHomework: row.hasHomework === true,
      });
      (row.assessmentColumns ?? []).forEach((column, index) => {
        columns.push({ sessionId: row.id, columnId: text(column.id), position: index, name: text(column.name) });
      });
      (row.attendanceColumnOrder ?? []).forEach((columnKey, index) => {
        columnOrder.push({ sessionId: row.id, columnKey: text(columnKey), position: index });
      });
      (row.attendance ?? []).forEach((item, index) => {
        attendance.push({
          sessionId: row.id,
          studentId: text(item.studentId),
          position: index,
          status: optionalText(item.status),
          firstStatus: optionalText(item.firstStatus),
          late: item.late === true,
          lessonRating: optionalText(item.lessonRating),
          homeworkRating: optionalText(item.homeworkRating),
          pronunciationVideoDone: item.pronunciationVideoDone === true,
          worksheetDone: item.worksheetDone === true,
          vocabularyScore: scoreText(item.vocabularyScore, `${row.id}/${item.studentId}/vocabularyScore`),
          note: text(item.note),
        });
        Object.entries(item.assessmentScores ?? {}).forEach(([columnId, score], scoreIndex) => {
          const scoreValue = scoreText(score, `${row.id}/${item.studentId}/${columnId}`);
          if (scoreValue === null) return;
          scores.push({ sessionId: row.id, studentId: text(item.studentId), columnId, position: scoreIndex, value: scoreValue });
        });
      });
    });

    return syncTables(tx, [
      { name: "lesson_sessions", delegate: tx.opsLessonSession as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: sessions },
      { name: "session_assessment_columns", delegate: tx.opsSessionAssessmentColumn as unknown as RowDelegate, keyFields: ["sessionId", "columnId"], orderField: "position", orderGroup: ["sessionId"], rows: columns },
      { name: "session_attendance_columns", delegate: tx.opsSessionAttendanceColumn as unknown as RowDelegate, keyFields: ["sessionId", "columnKey"], orderField: "position", orderGroup: ["sessionId"], rows: columnOrder },
      { name: "attendances", delegate: tx.opsAttendance as unknown as RowDelegate, keyFields: ["sessionId", "studentId"], orderField: "position", orderGroup: ["sessionId"], rows: attendance },
      { name: "attendance_scores", delegate: tx.opsAttendanceScore as unknown as RowDelegate, keyFields: ["sessionId", "studentId", "columnId"], orderField: "position", orderGroup: ["sessionId", "studentId"], rows: scores },
    ]);
  },
};
