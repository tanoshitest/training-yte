/*
 * Chấm điểm Phiếu — giao diện nối API /api/grading/* (OpenAI chấm bài thật).
 * Dùng chung state, render, api, toast, escapeHtml… của app.js (cùng phạm vi toàn cục).
 * Luồng: tạo bài kiểm tra (lớp + buổi + tên) → tải file đề → AI sinh đáp án (sửa được)
 *        → tải ảnh/thư mục bài làm → AI chấm từng bài, nhận ra học viên theo tên viết tay.
 */

const GRADING_GRADE_CONCURRENCY = 3;
const GRADING_IMAGE_MAX_SIDE = 2000;

function gradingData() {
  return state.grading;
}

function gradingDetail() {
  const detail = gradingData().detail;
  return detail && detail.test && detail.test.id === state.gradingTestId ? detail : null;
}

/** Gọi API có thân nhị phân (đề, ảnh bài làm); tên file gửi qua header X-File-Name. */
async function gradingUpload(path, method, blob, name, folder = "") {
  const headers = { "Content-Type": blob.type || "application/octet-stream", "X-File-Name": encodeURIComponent(name) };
  if (folder) headers["X-Folder-Name"] = encodeURIComponent(folder);
  const response = await fetch(path, { method, headers, body: blob });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Không tải lên được.");
  return payload;
}

async function loadGradingTests() {
  const data = gradingData();
  if (data.loading) return;
  data.loading = true;
  try {
    data.tests = (await api("/api/grading/tests")).tests;
    data.error = "";
  } catch (error) {
    data.tests = [];
    data.error = error.message;
  } finally {
    data.loading = false;
    render();
  }
}

async function loadGradingDetail(testId) {
  try {
    gradingData().detail = await api(`/api/grading/tests/${encodeURIComponent(testId)}`);
  } catch (error) {
    gradingData().detail = null;
    state.gradingTestId = "";
    toast(error.message);
  }
  render();
}

function gradingStatusBadge(summary) {
  if (!summary.submissionCount) return `<span class="badge badge-blue">Chưa có bài</span>`;
  if (summary.gradedCount === summary.submissionCount) return `<span class="badge badge-green">Đã chấm</span>`;
  return `<span class="badge badge-amber">Đã chấm ${summary.gradedCount}/${summary.submissionCount}</span>`;
}

function gradingSessionLabel(classId, sessionId) {
  const row = gradingSessionRows(classId).find((item) => item.session.id === sessionId);
  return row ? `Buổi ${row.sequence} · ${formatDateVi(row.session.date)}` : "—";
}

function gradingAiBanner() {
  const ai = state.data?.integrations?.ai;
  if (!ai) return "";
  if (ai.enabled && ai.apiKeyHint && ai.model) return `<p class="grading-ai-note muted">AI chấm bài: model <strong>${escapeHtml(ai.model)}</strong></p>`;
  const link = state.role === "ADMIN" ? ` <button class="table-link" type="button" data-nav="/cai-dat/tich-hop">Mở Cấu hình → Tích hợp</button>` : " Nhờ quản trị viên bật trong Cấu hình → Tích hợp.";
  return `<p class="grading-ai-note grading-ai-warn">Chưa cấu hình chấm bài AI (bật, nhập API key, chọn model).${link}</p>`;
}

function gradingWorksheetPage() {
  const data = gradingData();
  const tests = data.tests || [];
  const current = state.gradingTestId ? gradingDetail() : null;
  const totals = current
    ? { tests: 1, submitted: current.summary.submissionCount, graded: current.summary.gradedCount }
    : { tests: tests.length, submitted: tests.reduce((sum, item) => sum + item.submissionCount, 0), graded: tests.reduce((sum, item) => sum + item.gradedCount, 0) };
  const summary = `<div class="class-summary-grid"><section class="card summary-card"><small>Bài kiểm tra</small><strong>${totals.tests}</strong></section><section class="card summary-card"><small>Bài đã nộp</small><strong>${totals.submitted}</strong></section><section class="card summary-card"><small>AI đã chấm</small><strong>${totals.graded}</strong></section><section class="card summary-card"><small>Chờ chấm</small><strong>${totals.submitted - totals.graded}</strong></section></div>`;
  let body;
  if (state.gradingTestId) {
    body = current ? gradingDetailHtml(current) : `<section class="card settings-card"><div class="card-header"><p class="muted">Đang tải bài kiểm tra…</p></div></section>`;
  } else if (data.tests === null) {
    body = `<section class="card settings-card"><div class="card-header"><p class="muted">Đang tải danh sách bài kiểm tra…</p></div></section>`;
  } else {
    const rows = tests.map((test, index) => {
      const cls = findBy(state.data.classes, test.classId);
      return `<tr><td class="cell-index">${index + 1}</td><td><strong>${escapeHtml(test.name)}</strong></td><td>${escapeHtml(cls?.name || "—")}</td><td>${escapeHtml(gradingSessionLabel(test.classId, test.sessionId))}</td><td>${test.submissionCount}/${(cls?.studentIds || []).length}</td><td>${gradingStatusBadge(test)}</td><td><div class="row-actions settings-row-actions"><button class="secondary-btn periodic-student-open" type="button" data-grading-open="${escapeHtml(test.id)}">Xem</button><button class="trash-btn" type="button" data-grading-delete="${escapeHtml(test.id)}" title="Xoá bài kiểm tra">${icon("trash")}</button></div></td></tr>`;
    }).join("");
    body = `<section class="card settings-card"><div class="card-header"><div class="card-heading"><div><h2>Danh sách bài kiểm tra</h2><p>Tải đề lên để AI ra đáp án, tải bài làm của lớp lên rồi để AI chấm điểm từng học viên.</p>${data.error ? `<p class="grading-ai-warn">${escapeHtml(data.error)}</p>` : ""}${gradingAiBanner()}</div><button class="primary-btn" type="button" data-grading-create>${icon("plus")}Tạo bài kiểm tra</button></div></div><div class="table-wrap"><table class="grading-test-table"><thead><tr><th>STT</th><th>Bài kiểm tra</th><th>Lớp</th><th>Buổi</th><th>Bài nộp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows || '<tr><td class="empty-cell" colspan="7">Chưa có bài kiểm tra nào. Bấm "Tạo bài kiểm tra" để bắt đầu.</td></tr>'}</tbody></table></div></section>`;
  }
  return `<div class="people-page grading-page">${summary}${body}${gradingTestModalHtml()}${gradingViewModalHtml()}</div>`;
}

function gradingKeyHtml(test) {
  const key = test.answerKey;
  const busy = gradingData().busy;
  const generate = `<button class="secondary-btn" type="button" data-grading-generate ${test.exam && !busy ? "" : "disabled"}>${key ? "Sinh lại đáp án bằng AI" : "Sinh đáp án bằng AI"}</button>`;
  if (!key) {
    return `<div class="grading-step-head"><div><h3>2. Đáp án</h3><p class="muted">${test.exam ? "AI đọc đề và ra đáp án — sau đó bạn kiểm tra và sửa lại nếu cần." : "Tải file đề lên trước."}</p></div>${generate}</div>${busy === "key" ? '<p class="grading-progress">AI đang đọc đề và giải từng câu…</p>' : ""}`;
  }
  const rows = key.questions.map((question) => `<tr><td class="cell-index">${question.number}</td><td class="grading-key-prompt">${escapeHtml(question.prompt)}</td><td><textarea class="input" rows="2" data-key-answers="${question.number}" aria-label="Đáp án câu ${question.number}">${escapeHtml(question.acceptedAnswers.join("\n"))}</textarea></td></tr>`).join("");
  return `<div class="grading-step-head"><div><h3>2. Đáp án · ${key.questions.length} câu</h3><p class="muted">Mỗi dòng trong ô đáp án là một cách viết được chấp nhận. Điểm bài = số câu đúng / tổng số câu. ${key.editedAt ? "Giáo viên đã chỉnh sửa." : "Do AI sinh — hãy kiểm tra lại trước khi chấm."}</p></div><div class="grading-test-actions">${generate}<button class="primary-btn" type="button" data-grading-save-key ${busy ? "disabled" : ""}>Lưu đáp án</button></div></div>${busy === "key" ? '<p class="grading-progress">AI đang đọc đề và giải từng câu…</p>' : ""}<details class="grading-key-details" ${key.editedAt ? "" : "open"}><summary>Xem / sửa đáp án</summary><div class="table-wrap grading-key-table"><table><thead><tr><th>Câu</th><th>Đề</th><th>Đáp án chấp nhận (mỗi dòng một cách)</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function gradingSubmissionRow(test, submission, roster) {
  const result = submission.result;
  const options = [`<option value="">— Chưa xác định —</option>`].concat(roster.map((student) => `<option value="${escapeHtml(student.id)}" ${student.id === submission.studentId ? "selected" : ""}>${escapeHtml(student.fullName)} (${escapeHtml(student.code || "")})</option>`)).join("");
  const folderHint = submission.folderName ? `<small class="muted">Thư mục: ${escapeHtml(submission.folderName)}${submission.matchSource === "FOLDER" ? " · tự khớp" : ""}</small>` : "";
  const aiHint = result?.detectedName ? `<small class="muted">AI đọc: “${escapeHtml(result.detectedName)}”${submission.matchSource === "AI" ? " · tự khớp" : ""}</small>` : "";
  const hint = folderHint + aiHint;
  const statusMap = { UPLOADED: ["blue", "Chờ chấm"], GRADING: ["amber", "Đang chấm…"], GRADED: ["green", "Đã chấm"], ERROR: ["red", "Lỗi"] };
  const [tone, label] = statusMap[submission.status] || statusMap.UPLOADED;
  const score = result ? `<strong>${result.earned}/${result.total}</strong> <small class="muted">câu đúng</small>` : "—";
  const error = submission.status === "ERROR" ? `<small class="grading-ai-warn">${escapeHtml(submission.error || "")}</small>` : "";
  return `<tr><td><button class="grading-thumb" type="button" data-grading-view="${escapeHtml(submission.id)}"><img src="/api/grading/files/${escapeHtml(submission.pages[0].fileId)}" alt="Bài ${escapeHtml(submission.name)}" loading="lazy" /></button></td><td class="grading-file-name">${escapeHtml(submission.name)}<small class="muted">${submission.pages.length} ảnh</small></td><td><select class="input" data-grading-assign="${escapeHtml(submission.id)}">${options}</select>${hint}</td><td>${score}</td><td><span class="badge badge-${tone}">${label}</span>${error}</td><td><div class="row-actions settings-row-actions"><button class="secondary-btn" type="button" data-grading-add-pages="${escapeHtml(submission.id)}" ${gradingData().busy ? "disabled" : ""} title="Thêm ảnh (trang) vào bài làm này">+ Ảnh</button><button class="secondary-btn" type="button" data-grading-grade-one="${escapeHtml(submission.id)}" ${gradingData().busy ? "disabled" : ""}>${result ? "Chấm lại" : "Chấm"}</button>${result ? `<button class="secondary-btn" type="button" data-grading-view="${escapeHtml(submission.id)}">Xem</button><a class="secondary-btn" href="${gradingReportUrl(test.id, submission.id)}" download title="Tải phiếu kết quả PDF để in gửi học viên">PDF</a>` : ""}<button class="trash-btn" type="button" data-grading-remove="${escapeHtml(submission.id)}" title="Xoá bài làm">${icon("trash")}</button></div></td></tr>`;
}

function gradingDetailHtml(detail) {
  const { test, submissions } = detail;
  const data = gradingData();
  const cls = findBy(state.data.classes, test.classId);
  const roster = (cls?.studentIds || []).map((id) => findBy(state.data.students, id)).filter(Boolean);
  const assigned = new Set(submissions.map((item) => item.studentId).filter(Boolean));
  const missing = roster.filter((student) => !assigned.has(student.id));
  const pending = submissions.filter((item) => item.status !== "GRADED").length;
  const busy = data.busy;
  const examBlock = `<div class="grading-step-head"><div><h3>1. Đề bài</h3><p class="muted">${test.exam ? `${escapeHtml(test.exam.name)} · tải lên ${new Date(test.exam.uploadedAt).toLocaleString("vi-VN")}` : "Chưa có file đề. Hỗ trợ Word (.docx), PDF, ảnh hoặc .txt."}</p></div><div class="grading-test-actions">${test.exam ? `<a class="secondary-btn" href="/api/grading/files/${escapeHtml(test.exam.fileId)}" download="${escapeHtml(test.exam.name)}">${icon("download")}Tải đề về</a>` : ""}<button class="secondary-btn" type="button" data-grading-exam ${busy ? "disabled" : ""}>${icon("upload")}${test.exam ? "Đổi file đề" : "Tải file đề"}</button></div></div>`;
  const rows = submissions.map((item) => gradingSubmissionRow(test, item, roster)).join("");
  const subsBlock = `<div class="grading-step-head"><div><h3>3. Bài làm của học viên · ${submissions.length}/${roster.length}</h3><p class="muted">Chọn cả thư mục ảnh bài làm. Bài viết trên nhiều tờ: đặt "Ảnh mỗi bài" bằng số tờ, hoặc xếp mỗi học sinh vào một thư mục con. AI đọc tên viết tay để gán học viên, bạn sửa lại ở cột Học viên nếu cần.</p></div><div class="grading-test-actions"><label class="grading-pages-field" title="Mỗi thư mục con luôn là một học viên (số ảnh tuỳ ý). Các tuỳ chọn này áp dụng khi ảnh nằm chung một thư mục.">Cách chia ảnh <select class="input" data-grading-pages-per ${busy ? "disabled" : ""}>${[["1", "Mỗi ảnh một học viên"], ["2", "Cứ 2 ảnh một học viên"], ["3", "Cứ 3 ảnh một học viên"], ["4", "Cứ 4 ảnh một học viên"], ["5", "Cứ 5 ảnh một học viên"], ["6", "Cứ 6 ảnh một học viên"], ["all", "Tất cả ảnh là một học viên"]].map(([value, label]) => `<option value="${value}" ${String(data.pagesPer || 1) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="secondary-btn" type="button" data-grading-folder ${busy ? "disabled" : ""}>${icon("upload")}Chọn thư mục</button><button class="secondary-btn" type="button" data-grading-files ${busy ? "disabled" : ""}>${icon("upload")}Chọn ảnh</button>${submissions.some((item) => item.status === "GRADED") ? `<a class="secondary-btn" href="/api/grading/tests/${encodeURIComponent(test.id)}/reports.zip" download title="Một file zip, mỗi học viên đã chấm một phiếu kết quả PDF">${icon("download")}Tải PDF cả lớp (.zip)</a>` : ""}<button class="secondary-btn" type="button" data-grading-write-scores ${busy || !submissions.some((item) => item.status === "GRADED" && item.studentId) ? "disabled" : ""} title="Ghi điểm (số câu đúng/tổng câu) của các bài đã chấm và đã gán học viên vào cột &quot;${escapeHtml(test.name)}&quot; của phiếu điểm danh buổi này">Ghi điểm vào phiếu điểm danh</button><button class="primary-btn" type="button" data-grading-grade-all ${busy || !pending || !test.answerKey ? "disabled" : ""} ${!test.answerKey ? 'title="Cần có đáp án trước"' : ""}>Chấm ${pending ? `(${pending})` : "tất cả"}</button></div></div>${data.progress ? `<p class="grading-progress">${escapeHtml(data.progress)}</p>` : ""}<details class="grading-folder-guide"><summary>Cách sắp xếp thư mục bài nộp</summary><div><p><strong>Cách 1 (khuyên dùng): mỗi học viên một thư mục con.</strong> Số ảnh mỗi bạn tuỳ ý (tối đa 12). Đặt tên thư mục theo tên học viên để hệ thống tự gán đúng người.</p><pre>bainop/
├─ Nguyen Van A/
│  ├─ 1.jpg
│  └─ 2.jpg
├─ Tran Thi B/
│  └─ 1.jpg
└─ Le Van C/
   ├─ 1.jpg
   ├─ 2.jpg
   └─ 3.jpg</pre><p>Bấm <strong>Chọn thư mục</strong> rồi chọn thư mục ngoài cùng (<code>bainop</code>). Ảnh trong mỗi thư mục được xếp theo tên file, nên đặt 1, 2, 3… đúng thứ tự các trang.</p><p><strong>Cách 2: các ảnh để chung một thư mục.</strong> Chọn ở ô <em>Cách chia ảnh</em> số ảnh mỗi học viên (ví dụ "Cứ 2 ảnh một học viên"). Ảnh được xếp theo tên file rồi cắt đều, nên mỗi bạn phải nộp đủ số ảnh bằng nhau và đặt tên file theo thứ tự (01, 02, 03…).</p><p><strong>Cách 3: chỉ chấm một bạn.</strong> Chọn thư mục ảnh của bạn đó, đặt <em>Cách chia ảnh</em> = "Tất cả ảnh là một học viên".</p><p>Học viên chưa gán được (tên thư mục hoặc chữ viết tay không khớp) sẽ hiện "Chưa xác định": chọn tay ở cột Học viên. Mỗi học viên chỉ có một bài trong một bài kiểm tra; bài thiếu trang thì bấm <strong>+ Ảnh</strong> ở dòng đó để thêm.</p></div></details><div class="table-wrap grading-sub-table"><table><thead><tr><th>Ảnh</th><th>File</th><th>Học viên</th><th>Điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows || '<tr><td class="empty-cell" colspan="6">Chưa có bài làm. Bấm "Chọn thư mục" hoặc "Chọn ảnh".</td></tr>'}</tbody></table></div>${submissions.length && missing.length ? `<p class="muted grading-missing">Chưa có bài: ${missing.map((student) => escapeHtml(student.fullName)).join(", ")}</p>` : ""}`;
  return `<section class="card settings-card"><div class="card-header"><div class="card-heading"><div><button class="secondary-btn grading-back" type="button" data-grading-back>← Danh sách bài kiểm tra</button><h2>${escapeHtml(test.name)}</h2><p>${escapeHtml(cls?.name || "—")} · ${escapeHtml(gradingSessionLabel(test.classId, test.sessionId))}</p>${gradingAiBanner()}</div></div></div><div class="grading-detail-scroll"><section class="grading-step">${examBlock}</section><section class="grading-step">${gradingKeyHtml(test)}</section><section class="grading-step">${subsBlock}</section></div><input id="grading-exam-input" type="file" accept=".docx,.pdf,.txt,image/*" hidden /><input id="grading-folder-input" type="file" webkitdirectory multiple hidden /><input id="grading-files-input" type="file" accept="image/*" multiple hidden /><input id="grading-addpages-input" type="file" accept="image/*" multiple hidden /></section>`;
}

function gradingTestModalHtml() {
  if (!state.gradingModal) return "";
  // Mọi nhân sự chọn được lớp bất kỳ (anh Mori 18/11/2026), không chỉ lớp được gán.
  const classes = (state.data.classes || []).filter((cls) => cls.status === "ACTIVE");
  const classId = state.gradingModal.classId || "";
  const sessionId = state.gradingModal.sessionId || "";
  const sessions = classId ? gradingSessionRows(classId).slice().reverse() : [];
  const existing = sessionId ? (gradingData().tests || []).filter((item) => item.sessionId === sessionId) : [];
  const classOptions = `<option value="">— Chọn lớp —</option>${classes.map((cls) => `<option value="${escapeHtml(cls.id)}" ${cls.id === classId ? "selected" : ""}>${escapeHtml(cls.name)}</option>`).join("")}`;
  const sessionOptions = `<option value="">— Chọn buổi —</option>${sessions.map(({ session, sequence }) => `<option value="${escapeHtml(session.id)}" ${session.id === sessionId ? "selected" : ""}>Buổi ${sequence} · ${formatDateVi(session.date)} · ${escapeHtml(session.startTime || "")}–${escapeHtml(session.endTime || "")}</option>`).join("")}`;
  const existingList = sessionId
    ? `<div class="grading-existing"><strong>Bài đã tạo trong buổi này:</strong>${existing.length ? `<ul>${existing.map((item) => `<li>${escapeHtml(item.name)} · ${item.submissionCount} bài nộp</li>`).join("")}</ul>` : `<p class="muted">Buổi này chưa có bài kiểm tra nào.</p>`}</div>`
    : "";
  const itemNames = sessionId ? gradingSessionItemNames(findBy(state.data.classes, classId), sessionId) : [];
  const nameField = sessionId
    ? `<label class="field"><span>Tên bài kiểm tra</span><select class="input" name="name" required><option value="">— Chọn bài trong buổi —</option>${itemNames.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></label>`
    : `<label class="field"><span>Tên bài kiểm tra</span><input class="input" name="name" disabled placeholder="Chọn buổi học trước" /></label>`;
  return `<div class="modal-backdrop" data-action="close-grading-test"><section class="modal-card periodic-report-modal" data-grading-test-card role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Tạo bài kiểm tra</h2><p>Chọn lớp, buổi học và bài kiểm tra của buổi đó — đề và bài làm tải lên ở bước sau.</p></div><button class="close-btn" type="button" data-action="close-grading-test" aria-label="Đóng">×</button></div><form id="grading-test-form" class="form-grid padded"><label class="field"><span>Lớp học</span><select class="input" name="classId" required>${classOptions}</select></label><label class="field"><span>Buổi của bài kiểm tra</span><select class="input" name="sessionId" required ${classId ? "" : "disabled"}>${sessionOptions}</select></label>${existingList}${nameField}<div class="settings-modal-footer"><button class="secondary-btn" type="button" data-action="close-grading-test">Hủy</button><button class="primary-btn" type="submit">Tạo bài kiểm tra</button></div></form></section></div>`;
}

function gradingViewModalHtml() {
  if (!state.gradingView) return "";
  const detail = gradingDetail();
  const submission = detail?.submissions.find((item) => item.id === state.gradingView);
  if (!submission) return "";
  const student = findBy(state.data.students, submission.studentId);
  const result = submission.result;
  const pagesHtml = submission.pages.map((page, index) => {
    return `<div class="grading-view-page">${submission.pages.length > 1 ? `<small class="muted">Trang ${index + 1}/${submission.pages.length}</small>` : ""}<div class="grading-view-image"><img src="/api/grading/files/${escapeHtml(page.fileId)}" alt="Bài làm ${escapeHtml(submission.name)} trang ${index + 1}" /></div></div>`;
  }).join("");
  const keyByNumber = new Map((detail.test.answerKey?.questions || []).map((question) => [question.number, question]));
  const showAll = state.gradingViewAll === true;
  const shown = result ? result.answers.filter((item) => showAll || !item.correct) : [];
  const notes = result ? shown.map((item) => {
    const blank = !item.studentAnswer && !item.correct;
    const expected = keyByNumber.get(item.number)?.acceptedAnswers?.[0] || "";
    const fix = item.correct ? "" : `${blank ? "" : ""}${item.correction ? `<div class="grading-fix"><span>Sửa lại</span><b>${escapeHtml(item.correction)}</b></div>` : ""}${expected && !gradingSameText(expected, item.correction) ? `<div class="grading-fix"><span>Đáp án</span><b>${escapeHtml(expected)}</b></div>` : ""}${item.comment && !blank ? `<em>${escapeHtml(item.comment)}</em>` : ""}`;
    return `<li class="${item.correct ? "grading-ok" : "grading-bad"}${blank ? " grading-blank" : ""}"><div class="grading-answer-head"><strong>Câu ${item.number} ${item.correct ? "✓" : "✗"}</strong>${submission.pages.length > 1 ? `<small class="muted">trang ${item.page || 1}</small>` : ""}${item.teacherEdited ? '<small class="grading-edited">GV đã sửa</small>' : ""}<button class="table-link" type="button" data-grading-flip="${item.number}" title="AI đọc nhầm chữ viết tay? Đổi kết quả câu này">Đổi thành ${item.correct ? "sai" : "đúng"}</button></div><div class="grading-student-answer"><span>Bài làm</span>${escapeHtml(item.studentAnswer || "(bỏ trống)")}</div>${fix}</li>`;
  }).join("") : "";
  const feedback = result?.feedback ? `<div class="grading-feedback"><h3>Góp ý cho học viên</h3><p>${escapeHtml(result.feedback)}</p></div>` : "";
  const title = student ? student.fullName : (result?.detectedName ? `${result.detectedName} (chưa gán học viên)` : submission.name);
  const sub = result ? `Đúng ${result.earned}/${result.total} câu · ${escapeHtml(result.model)}` : "Chưa chấm";
  return `<div class="modal-backdrop" data-action="close-grading-view"><section class="modal-card grading-view-modal" data-grading-view-card role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Bài làm · ${escapeHtml(title)}</h2><p>${escapeHtml(detail.test.name)} · ${sub}</p></div><button class="close-btn" type="button" data-action="close-grading-view" aria-label="Đóng">×</button></div><div class="grading-view-body"><div class="grading-view-pages">${pagesHtml}</div><div class="grading-view-notes"><div class="grading-notes-head"><div class="grading-filter" role="group" aria-label="Lọc câu">${result ? `<button type="button" class="${showAll ? "" : "active"}" data-grading-filter="wrong">Câu sai (${result.answers.filter((item) => !item.correct).length})</button><button type="button" class="${showAll ? "active" : ""}" data-grading-filter="all">Tất cả (${result.answers.length})</button>` : "<h3>Kết quả từng câu</h3>"}</div>${result ? `<a class="secondary-btn" href="${gradingReportUrl(detail.test.id, submission.id)}" download>${icon("download")}Tải PDF báo cáo</a>` : ""}</div><div class="grading-notes-scroll">${feedback}<ul class="grading-answer-list">${notes || (result ? "<li class=\"grading-ok\">Không có câu sai nào.</li>" : "<li>Chưa chấm bài này.</li>")}</ul></div>${result?.note ? `<p class="muted">${escapeHtml(result.note)}</p>` : ""}</div></div></section></div>`;
}

/** Thu nhỏ ảnh chụp (tối đa 2000px, JPEG) để tải nhanh mà chữ viết tay vẫn đọc được. */
async function gradingShrinkImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name}: không đọc được ảnh (ảnh HEIC cần đổi sang JPG).`);
  }
  const scale = Math.min(1, GRADING_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error(`${file.name}: không nén được ảnh.`);
  return blob;
}

function gradingSetBusy(busy, progress = "") {
  gradingData().busy = busy;
  gradingData().progress = progress;
  render();
}

/**
 * Chia danh sách ảnh thành các bài làm, mỗi nhóm = một học sinh.
 *  - Có từ 2 thư mục chứa ảnh trở lên (bainop/Nguyen-Van-A/…, bainop/Tran-Thi-B/…): mỗi thư mục một học sinh,
 *    tên thư mục dùng để gán học viên.
 *  - `perSubmission` = "all": toàn bộ ảnh là một học sinh (thư mục duy nhất, nếu có, dùng làm tên).
 *  - Chỉ một thư mục phẳng: cứ `perSubmission` ảnh liên tiếp (sắp theo tên file) là một học sinh.
 */
function gradingGroupFiles(files, perSubmission) {
  const relative = (file) => String(file.webkitRelativePath || file.name);
  const folderOf = (file) => relative(file).split("/").slice(0, -1).join("/");
  const sorted = files.slice().sort((a, b) => relative(a).localeCompare(relative(b), "vi", { numeric: true }));
  const folders = new Set(sorted.map(folderOf));
  // "Tất cả ảnh là một học viên": ví dụ chọn đúng thư mục ảnh của một bạn (2, 3 hay nhiều ảnh tuỳ ý).
  if (perSubmission === "all") return [{ files: sorted, folder: folders.size === 1 ? [...folders][0].split("/").pop() : "" }];
  if (folders.size >= 2) {
    const byFolder = new Map();
    for (const file of sorted) {
      const folder = folderOf(file);
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push(file);
    }
    return [...byFolder.entries()].map(([folder, group]) => ({ files: group, folder: folder.split("/").pop() }));
  }
  const size = Math.max(1, Math.min(12, Math.round(perSubmission) || 1));
  const groups = [];
  for (let i = 0; i < sorted.length; i += size) groups.push({ files: sorted.slice(i, i + size), folder: "" });
  return groups;
}

/** Thêm ảnh vào một bài làm đã có (học viên nộp thêm trang); bài về trạng thái chờ chấm lại. */
async function gradingAddPages(submissionId, fileList) {
  const detail = gradingDetail();
  const files = Array.from(fileList || []).filter((file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
  if (!detail || !submissionId || !files.length) return;
  const url = `/api/grading/tests/${encodeURIComponent(detail.test.id)}/submissions/${encodeURIComponent(submissionId)}/pages`;
  let done = 0;
  let lastError = "";
  gradingSetBusy("upload", `Đang thêm ảnh 0/${files.length}…`);
  for (const file of files) {
    try {
      await gradingUpload(url, "POST", await gradingShrinkImage(file), file.name.replace(/\.\w+$/, "") + ".jpg");
      done += 1;
    } catch (error) { lastError = error.message; }
    gradingSetBusy("upload", `Đang thêm ảnh ${done}/${files.length}…`);
  }
  gradingSetBusy("");
  await loadGradingDetail(detail.test.id);
  toast(lastError ? `Đã thêm ${done}/${files.length} ảnh: ${lastError}` : `Đã thêm ${done} ảnh. Bấm "Chấm lại" để AI chấm lại bài này.`);
}

async function gradingUploadSubmissions(fileList) {
  const detail = gradingDetail();
  if (!detail) return;
  const files = Array.from(fileList || []).filter((file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!files.length) return toast("Không thấy file ảnh nào (JPG, PNG, WebP).");
  const groups = gradingGroupFiles(files, gradingData().pagesPer || 1);
  const testId = detail.test.id;
  const base = `/api/grading/tests/${encodeURIComponent(testId)}/submissions`;
  let done = 0;
  let failed = 0;
  let lastError = "";
  let created = 0;
  gradingSetBusy("upload", `Đang tải ảnh 0/${files.length}…`);
  for (const group of groups) {
    let submissionId = "";
    for (const file of group.files) {
      try {
        const blob = await gradingShrinkImage(file);
        const name = file.name.replace(/\.\w+$/, "") + ".jpg";
        if (!submissionId) {
          const result = await gradingUpload(base, "POST", blob, name, group.folder);
          submissionId = result.submission.id;
          created += 1;
        } else {
          await gradingUpload(`${base}/${encodeURIComponent(submissionId)}/pages`, "POST", blob, name);
        }
        done += 1;
      } catch (error) {
        failed += 1;
        lastError = error.message;
      }
      gradingSetBusy("upload", `Đang tải ảnh ${done + failed}/${files.length}…`);
    }
  }
  gradingSetBusy("");
  await loadGradingDetail(testId);
  toast(failed ? `Đã tải ${done} ảnh, lỗi ${failed}: ${lastError}` : `Đã tải ${done} ảnh thành ${created} bài làm. Bấm "Chấm" để AI chấm.`);
}

async function gradingGradeIds(ids) {
  const detail = gradingDetail();
  if (!detail || !ids.length) return;
  const testId = detail.test.id;
  const queue = ids.slice();
  let done = 0;
  let failed = 0;
  let lastError = "";
  gradingSetBusy("grade", `AI đang chấm 0/${ids.length}…`);
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const row = detail.submissions.find((item) => item.id === id);
      if (row) row.status = "GRADING";
      render();
      try {
        const result = await api(`/api/grading/tests/${encodeURIComponent(testId)}/submissions/${encodeURIComponent(id)}/grade`, { method: "POST", body: "{}" });
        Object.assign(row, result.submission);
        done += 1;
      } catch (error) {
        failed += 1;
        lastError = error.message;
        if (row) { row.status = "ERROR"; row.error = error.message; }
      }
      gradingData().progress = `AI đang chấm ${done + failed}/${ids.length}…`;
      render();
    }
  };
  await Promise.all(Array.from({ length: Math.min(GRADING_GRADE_CONCURRENCY, ids.length) }, worker));
  gradingSetBusy("");
  await loadGradingDetail(testId);
  toast(failed ? `Đã chấm ${done} bài, lỗi ${failed}: ${lastError}` : `AI đã chấm ${done} bài.`);
}

/**
 * Ghi điểm (số câu đúng/tổng câu) vào cột điểm của buổi học (tên bài kiểm tra = "Từ vựng" hoặc tên cột tùy biến) cho các học viên
 * đã có bài chấm xong. Đi qua đúng API lưu buổi học của điểm danh nên giữ nguyên mọi kiểm tra quyền và đối soát.
 */
async function gradingWriteScoresToAttendance() {
  const detail = gradingDetail();
  if (!detail) return;
  const { test, submissions } = detail;
  const lesson = (state.data.lessonSessions || []).find((row) => row.id === test.sessionId && row.classId === test.classId);
  if (!lesson) return toast("Không tìm thấy buổi học của bài kiểm tra.");
  const isVocabulary = test.name === "Từ vựng";
  const column = isVocabulary ? null : (lesson.assessmentColumns || []).find((item) => String(item.name || "").trim() === test.name);
  if (!isVocabulary && !column) return toast(`Buổi học không còn cột điểm "${test.name}".`);
  const scores = new Map(submissions.filter((item) => item.status === "GRADED" && item.studentId && item.result).map((item) => [item.studentId, `${item.result.earned}/${item.result.total}`]));
  if (!scores.size) return toast("Chưa có bài nào chấm xong và gán học viên.");
  const item = structuredClone(lesson);
  const cellOf = (row) => (column ? row.assessmentScores?.[column.id] : row.vocabularyScore);
  let written = 0;
  let overwritten = 0;
  let missing = 0;
  for (const [studentId, score] of scores) {
    const row = (item.attendance || []).find((entry) => entry.studentId === studentId);
    if (!row) { missing += 1; continue; }
    const previous = cellOf(row);
    if (previous !== null && previous !== undefined && String(previous).trim() !== "" && String(previous).trim() !== score) overwritten += 1;
    if (column) row.assessmentScores = { ...(row.assessmentScores || {}), [column.id]: score };
    else row.vocabularyScore = score;
    written += 1;
  }
  if (!written) return toast("Các học viên này chưa có dòng điểm danh trong buổi — hãy điểm danh buổi học trước.");
  const note = `${overwritten ? `\n${overwritten} ô đã có điểm sẽ bị ghi đè.` : ""}${missing ? `\n${missing} học viên chưa được điểm danh nên bỏ qua.` : ""}`;
  if (!confirm(`Ghi điểm của ${written} học viên vào cột "${test.name}" của phiếu điểm danh?${note}`)) return;
  try {
    await persistLessonSession(item, `Đã ghi điểm ${written} học viên vào cột "${test.name}".`);
  } catch (error) { toast(error.message); }
}

/** So hai đáp án bỏ qua hoa/thường và dấu câu cuối để không hiện trùng "Sửa lại" và "Đáp án". */
function gradingSameText(a, b) {
  const norm = (value) => String(value || "").trim().replace(/[.?!\s]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/** Địa chỉ tải phiếu kết quả PDF của một bài làm (server dựng bằng pdf-lib). */
function gradingReportUrl(testId, submissionId) {
  return `/api/grading/tests/${encodeURIComponent(testId)}/submissions/${encodeURIComponent(submissionId)}/report.pdf`;
}

function gradingKeyFromForm() {
  const detail = gradingDetail();
  const questions = detail.test.answerKey.questions.map((question) => {
    const answers = document.querySelector(`[data-key-answers="${question.number}"]`)?.value || "";
    return { ...question, acceptedAnswers: answers.split("\n").map((line) => line.trim()).filter(Boolean) };
  });
  return { title: detail.test.answerKey.title, questions };
}

function bindGradingWorksheetEvents() {
  if (!state.route.startsWith("/bao-cao/cham-phieu")) return;
  const data = gradingData();
  if (data.tests === null && !data.loading) loadGradingTests();
  if (state.gradingTestId && !gradingDetail() && !data.detailLoading) {
    data.detailLoading = true;
    loadGradingDetail(state.gradingTestId).finally(() => { data.detailLoading = false; });
  }
  const testId = () => state.gradingTestId;
  document.querySelectorAll("[data-grading-open]").forEach((button) => button.addEventListener("click", () => {
    state.gradingTestId = button.dataset.gradingOpen || "";
    data.detail = null;
    render();
  }));
  document.querySelectorAll("[data-grading-back]").forEach((button) => button.addEventListener("click", () => {
    state.gradingTestId = "";
    data.detail = null;
    data.tests = null;
    render();
  }));
  document.querySelector("[data-grading-create]")?.addEventListener("click", () => {
    state.gradingModal = { classId: "", sessionId: "" };
    render();
  });
  document.querySelectorAll("[data-action='close-grading-test']").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target.closest("[data-grading-test-card]") && !event.target.closest("button[data-action='close-grading-test']")) return;
    state.gradingModal = null;
    render();
  }));
  document.querySelector("#grading-test-form")?.addEventListener("change", (event) => {
    if (!state.gradingModal) return;
    const name = event.target?.name;
    if (name === "classId") {
      state.gradingModal.classId = String(event.target.value || "");
      state.gradingModal.sessionId = "";
      render();
    } else if (name === "sessionId") {
      state.gradingModal.sessionId = String(event.target.value || "");
      render();
    }
  });
  document.querySelector("#grading-test-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const classId = String(fd.get("classId") || "");
    const sessionId = String(fd.get("sessionId") || "");
    if (!classId || !sessionId || !name) return toast("Chọn đủ lớp, buổi học và đặt tên bài kiểm tra.");
    try {
      const result = await api("/api/grading/tests", { method: "POST", body: JSON.stringify({ name, classId, sessionId }) });
      state.gradingModal = null;
      state.gradingTestId = result.test.id;
      data.detail = result;
      data.tests = null;
      render();
      toast(`Đã tạo "${name}". Tải file đề lên để AI ra đáp án.`);
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll("[data-grading-delete]").forEach((button) => button.addEventListener("click", async () => {
    const test = (data.tests || []).find((item) => item.id === button.dataset.gradingDelete);
    if (!test || !confirm(`Xoá bài kiểm tra "${test.name}" cùng toàn bộ bài làm đã tải?`)) return;
    try {
      await api(`/api/grading/tests/${encodeURIComponent(test.id)}`, { method: "DELETE" });
      data.tests = null;
      render();
      toast(`Đã xoá "${test.name}".`);
    } catch (error) { toast(error.message); }
  }));

  // Đề bài
  document.querySelector("[data-grading-exam]")?.addEventListener("click", () => document.querySelector("#grading-exam-input")?.click());
  document.querySelector("#grading-exam-input")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    gradingSetBusy("exam", "Đang tải file đề…");
    try {
      data.detail = await gradingUpload(`/api/grading/tests/${encodeURIComponent(testId())}/exam`, "PUT", file, file.name);
      toast(`Đã tải đề "${file.name}". Bấm "Sinh đáp án bằng AI".`);
    } catch (error) { toast(error.message); }
    gradingSetBusy("");
  });
  document.querySelector("[data-grading-generate]")?.addEventListener("click", async () => {
    const test = gradingDetail()?.test;
    if (test?.answerKey && !confirm("Sinh lại sẽ thay toàn bộ đáp án hiện tại (kể cả phần đã sửa). Tiếp tục?")) return;
    gradingSetBusy("key");
    try {
      data.detail = await api(`/api/grading/tests/${encodeURIComponent(testId())}/answer-key/generate`, { method: "POST", body: "{}" });
      toast("AI đã sinh đáp án. Kiểm tra lại trước khi chấm.");
    } catch (error) { toast(error.message); }
    gradingSetBusy("");
  });
  document.querySelector("[data-grading-save-key]")?.addEventListener("click", async () => {
    try {
      data.detail = await api(`/api/grading/tests/${encodeURIComponent(testId())}/answer-key`, { method: "PUT", body: JSON.stringify(gradingKeyFromForm()) });
      render();
      toast("Đã lưu đáp án.");
    } catch (error) { toast(error.message); }
  });

  // Bài làm
  document.querySelector("[data-grading-pages-per]")?.addEventListener("change", (event) => {
    const value = event.currentTarget.value;
    data.pagesPer = value === "all" ? "all" : Math.max(1, Math.min(12, Math.round(Number(value)) || 1));
  });
  let addPagesTarget = "";
  document.querySelectorAll("[data-grading-add-pages]").forEach((button) => button.addEventListener("click", () => {
    addPagesTarget = button.dataset.gradingAddPages || "";
    document.querySelector("#grading-addpages-input")?.click();
  }));
  document.querySelector("#grading-addpages-input")?.addEventListener("change", (event) => {
    const files = event.currentTarget.files;
    const target = addPagesTarget;
    gradingAddPages(target, files).finally(() => { event.currentTarget.value = ""; });
  });
  document.querySelector("[data-grading-folder]")?.addEventListener("click", () => document.querySelector("#grading-folder-input")?.click());
  document.querySelector("[data-grading-files]")?.addEventListener("click", () => document.querySelector("#grading-files-input")?.click());
  for (const selector of ["#grading-folder-input", "#grading-files-input"]) {
    document.querySelector(selector)?.addEventListener("change", (event) => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = "";
      gradingUploadSubmissions(files);
    });
  }
  document.querySelector("[data-grading-write-scores]")?.addEventListener("click", () => gradingWriteScoresToAttendance());
  document.querySelector("[data-grading-grade-all]")?.addEventListener("click", () => {
    gradingGradeIds(gradingDetail().submissions.filter((item) => item.status !== "GRADED").map((item) => item.id));
  });
  document.querySelectorAll("[data-grading-grade-one]").forEach((button) => button.addEventListener("click", () => gradingGradeIds([button.dataset.gradingGradeOne])));
  document.querySelectorAll("[data-grading-assign]").forEach((select) => select.addEventListener("change", async () => {
    try {
      const result = await api(`/api/grading/tests/${encodeURIComponent(testId())}/submissions/${encodeURIComponent(select.dataset.gradingAssign)}`, { method: "PUT", body: JSON.stringify({ studentId: select.value || null }) });
      Object.assign(gradingDetail().submissions.find((item) => item.id === select.dataset.gradingAssign), result.submission);
      render();
    } catch (error) {
      toast(error.message);
      render();
    }
  }));
  document.querySelectorAll("[data-grading-remove]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Xoá bài làm này?")) return;
    try {
      await api(`/api/grading/tests/${encodeURIComponent(testId())}/submissions/${encodeURIComponent(button.dataset.gradingRemove)}`, { method: "DELETE" });
      await loadGradingDetail(testId());
    } catch (error) { toast(error.message); }
  }));
  document.querySelectorAll("[data-grading-view]").forEach((button) => button.addEventListener("click", () => {
    state.gradingView = button.dataset.gradingView || "";
    state.gradingViewAll = false;
    render();
  }));
  document.querySelectorAll("[data-grading-filter]").forEach((button) => button.addEventListener("click", () => {
    state.gradingViewAll = button.dataset.gradingFilter === "all";
    render();
  }));
  document.querySelectorAll("[data-grading-flip]").forEach((button) => button.addEventListener("click", async () => {
    const submission = gradingDetail()?.submissions.find((item) => item.id === state.gradingView);
    const item = submission?.result?.answers.find((entry) => String(entry.number) === button.dataset.gradingFlip);
    if (!item) return;
    try {
      const result = await api(`/api/grading/tests/${encodeURIComponent(testId())}/submissions/${encodeURIComponent(submission.id)}/answers`, { method: "PUT", body: JSON.stringify({ answers: { [item.number]: !item.correct } }) });
      Object.assign(submission, result.submission);
      render();
    } catch (error) { toast(error.message); }
  }));
  document.querySelectorAll("[data-action='close-grading-view']").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target.closest("[data-grading-view-card]") && !event.target.closest("button[data-action='close-grading-view']")) return;
    state.gradingView = "";
    render();
  }));
}
