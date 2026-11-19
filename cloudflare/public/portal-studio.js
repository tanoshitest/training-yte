/*
 * Portal — soạn bài cho cổng học viên (menu Quản lý Vận hành → Portal, đường dẫn /soan-portal).
 * Dùng chung state, render, api, toast, escapeHtml, icon… của app.js (cùng phạm vi toàn cục),
 * giống grading-worksheet.js.
 *
 * Dữ liệu dùng đúng hệ thống syllabus hiện có: một chương trình (vd. SEED 1) là một syllabus,
 * mỗi buổi là một Course Day (kèm lesson), mỗi khối nội dung là một GameActivity gắn
 * `portalBlock`. Lưu qua /api/syllabuses/:id/actions (createDay, updateDay, deleteDay,
 * upsertActivity…). Ảnh / âm thanh / video tải lên /api/media (đĩa VPS).
 * Học viên chơi bằng trình phát sẵn có ở /activity-preview/... (syllabus.js).
 */

const PORTAL_STUDIO_BLOCKS = [
  { id: "flashcard", engineType: "flashcard", mode: "flip", title: "Flashcard từ vựng", icon: "grid", hint: "Ảnh + từ tiếng Anh + nghĩa. Có file âm thanh thì phát file, không có thì đọc bằng giọng máy." },
  { id: "phonics_video", engineType: "interactive_video", mode: "checkpoint", title: "Video Phonics", icon: "star", hint: "Video luyện âm (vd. s, a, t, i, p, n)." },
  { id: "context_video", engineType: "interactive_video", mode: "checkpoint", title: "Video câu ngữ cảnh", icon: "users", hint: "Video đọc câu mẫu trong tình huống (vd. What's your name?)." },
  { id: "reader", engineType: "reader", mode: "pages", title: "Đọc sách", icon: "book", hint: "Sách tranh: ảnh bìa + từng trang (ảnh + câu + âm thanh). Học viên chọn Nghe đọc (sách tự đọc, tự lật trang) hoặc Tự đọc (tự lật, bấm Nghe, thu âm để AI chấm)." },
  { id: "sentences", engineType: "reader", mode: "pages", title: "Mẫu câu", icon: "users", hint: "Mỗi thẻ: ảnh + một mẫu câu (+ nghĩa). Bấm Nghe phát file âm thanh, không có file thì đọc bằng giọng máy." },
  { id: "homework", engineType: "reader", mode: "pages", title: "Nhiệm vụ về nhà", icon: "clipboard", hint: "Ghi chú bài về nhà cho học viên và phụ huynh (chữ)." },
];

const PORTAL_STUDIO_PROGRESS = {};

function portalStudio() {
  if (!state.portalStudio) state.portalStudio = { syllabusId: "", doc: null, loading: false, error: "", dayId: "", editor: null, busy: false };
  return state.portalStudio;
}

/** Chỉ chương trình soạn cho Portal (level "Portal", hoặc SEED tạo trước đó). Syllabus cũ STARTER/MOVERS/FLYERS ẩn hẳn — dữ liệu vẫn giữ. */
function portalStudioIsProgram(item) {
  const level = String(item.level || "").toLowerCase();
  return level === "portal" || level === "seed" || /^SEED/i.test(String(item.code || ""));
}

function portalStudioPrograms() {
  return (state.data.syllabuses || []).filter(portalStudioIsProgram).map((item) => ({ id: item.id, name: item.name, code: item.code || "" }));
}

function portalStudioCodeFrom(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "D").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20);
}

function portalStudioSelectedId() {
  const ps = portalStudio();
  const programs = portalStudioPrograms();
  if (ps.syllabusId && programs.some((item) => item.id === ps.syllabusId)) return ps.syllabusId;
  const seed = programs.find((item) => /^SEED/i.test(item.code) || /^SEED/i.test(item.name));
  return seed ? seed.id : (programs[0]?.id || "");
}

async function portalStudioLoad(id, force = false) {
  const ps = portalStudio();
  if (!id || ps.loading || (!force && ps.doc && ps.doc.meta.id === id)) return;
  ps.loading = true;
  ps.error = "";
  try {
    ps.doc = await api(`/api/syllabuses/${encodeURIComponent(id)}`);
    ps.syllabusId = id;
    const days = portalStudioDays();
    if (!days.some((day) => day.id === ps.dayId)) ps.dayId = days[0]?.id || "";
  } catch (error) {
    ps.error = error.message || "Không tải được chương trình.";
  } finally {
    ps.loading = false;
    if (state.route.startsWith("/soan-portal")) render();
  }
}

async function portalStudioMutate(input, okMessage) {
  const ps = portalStudio();
  ps.busy = true;
  try {
    const result = await api(`/api/syllabuses/${encodeURIComponent(ps.doc.meta.id)}/actions`, { method: "POST", body: JSON.stringify(input) });
    ps.doc = result.document;
    if (okMessage) toast(okMessage);
    return result;
  } finally {
    ps.busy = false;
  }
}

function portalStudioDays() {
  const doc = portalStudio().doc;
  if (!doc) return [];
  return [...(doc.days || [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

function portalStudioLesson(dayId) {
  const doc = portalStudio().doc;
  return (doc?.lessons || []).filter((lesson) => lesson.courseDayId === dayId).sort((a, b) => a.order - b.order)[0] || null;
}

/** Mọi hoạt động Portal của một buổi, theo thứ tự thêm (một buổi có thể có nhiều hoạt động cùng loại). */
function portalStudioDayActivities(lessonId) {
  const doc = portalStudio().doc;
  return (doc?.activities || []).filter((activity) => activity.lessonId === lessonId && activity.portalBlock)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

function portalStudioActivity(lessonId, block) {
  const doc = portalStudio().doc;
  const list = (doc?.activities || []).filter((activity) => activity.lessonId === lessonId);
  return list.find((activity) => activity.portalBlock === block.id) || null;
}

function portalStudioBlockSummary(block, activity) {
  if (!activity) return "Chưa soạn";
  const items = activity.config?.items || [];
  if (block.id === "flashcard") return `${items.length} thẻ · ${items.filter((item) => item.image).length} có ảnh`;
  if (block.id === "reader") return `${items.length} trang${activity.config?.mediaUrl ? " · có bìa" : ""}`;
  if (block.id === "sentences") return `${items.length} mẫu câu · ${items.filter((item) => item.image).length} có ảnh`;
  if (block.id === "homework") return String(activity.config?.content || "").split("\n").map((line) => line.trim()).filter((line) => line && !line.endsWith(":")).slice(0, 2).join(" · ") || "Chưa có nội dung";
  return activity.config?.mediaUrl ? "Đã có video" : "Chưa có video";
}

function portalStudioDayLabel(day, index) {
  const title = String(day.title || "").trim();
  const base = `Buổi ${index + 1}`;
  return title && title !== base ? `${base} · ${title}` : base;
}

function portalStudioPage() {
  const ps = portalStudio();
  const programs = portalStudioPrograms();
  const selectedId = portalStudioSelectedId();
  if (selectedId && (!ps.doc || ps.doc.meta.id !== selectedId) && !ps.loading && !ps.error) portalStudioLoad(selectedId);
  const loaded = Boolean(ps.doc && ps.doc.meta.id === selectedId);

  const programSelect = programs.length
    ? `<select class="input ps-program" id="ps-program" aria-label="Chương trình">${!selectedId ? '<option value="">— Chọn chương trình —</option>' : ""}${programs.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}${item.code ? ` (${escapeHtml(item.code)})` : ""}</option>`).join("")}</select>`
    : '<span class="ps-muted">Chưa có chương trình</span>';
  let bar;
  if (ps.creating) {
    bar = `<form class="ps-bar-form" id="ps-create-form"><input class="input" id="ps-create-name" required maxlength="80" placeholder="Tên chương trình, vd. SEED 2" value="${escapeHtml(ps.createName || "")}"><input class="input ps-code" id="ps-create-code" maxlength="20" placeholder="Mã" value="${escapeHtml(ps.createCode || "")}"><button class="primary-btn" type="submit" ${ps.busy ? "disabled" : ""}>${ps.busy ? "Đang tạo…" : "Tạo"}</button><button class="secondary-btn" type="button" data-ps-action="create-template" ${ps.busy ? "disabled" : ""} title="Tạo 24 buổi từ file Chương Trình 2021.docx">${icon("book")}Theo mẫu Chương trình 2021</button><button class="secondary-btn" type="button" data-ps-action="create-cancel">Hủy</button></form>`;
  } else if (ps.renaming && loaded) {
    bar = `<form class="ps-bar-form" id="ps-rename-form"><input class="input" id="ps-rename-name" required maxlength="80" placeholder="Tên khoá" value="${escapeHtml(ps.renameName ?? ps.doc.meta.name ?? "")}"><input class="input ps-code" id="ps-rename-code" maxlength="20" placeholder="Mã" value="${escapeHtml(ps.renameCode ?? ps.doc.meta.code ?? "")}"><button class="primary-btn" type="submit" ${ps.busy ? "disabled" : ""}>Lưu tên</button><button class="secondary-btn" type="button" data-ps-action="rename-cancel">Hủy</button></form>`;
  } else {
    const days = loaded ? portalStudioDays() : [];
    const total = loaded ? (ps.doc.activities || []).filter((activity) => activity.portalBlock).length : 0;
    bar = `<div class="ps-bar-main">${programSelect}${loaded ? `<button class="mini-btn" type="button" data-ps-action="rename-program" title="Đổi tên khoá">${icon("pencil")}</button>` : ""}${loaded ? `<button class="mini-btn" type="button" data-ps-action="preview-portal" title="Xem Portal như học viên (chỉ hoạt động đang hiện)">${icon("eye")}</button>` : ""}${loaded && isSuperAdmin() ? `<button class="mini-btn ps-mini-danger" type="button" data-ps-action="delete-program" title="Xoá chương trình" ${ps.busy ? "disabled" : ""}>${icon("trash")}</button>` : ""}${loaded ? `<span class="ps-bar-meta">${days.length} buổi · ${total} hoạt động</span>` : ""}</div><button class="secondary-btn ps-sm" type="button" data-ps-action="create-program">${icon("plus")}Tạo chương trình</button>`;
  }
  const progress = ps.importing ? `<div class="ps-progress"><span class="spinner"></span>${escapeHtml(ps.importing)}</div>` : "";
  const shell = (body) => `<div class="portal-studio"><div class="ps-shell"><header class="ps-bar">${bar}</header>${progress}${body}</div>${ps.editor ? portalStudioEditorModal() : ""}</div>`;

  if (ps.creating) return shell(`<div class="ps-blank">Nhập tên + mã rồi bấm <b>Tạo</b> (khoá trống), hoặc <b>Theo mẫu Chương trình 2021</b> để tạo sẵn 24 buổi.</div>`);
  if (!selectedId) return shell(`<div class="ps-blank">Chưa có chương trình. Bấm <b>Tạo chương trình</b> để bắt đầu.</div>`);
  if (ps.error) return shell(`<div class="ps-blank">${escapeHtml(ps.error)} <button class="secondary-btn ps-sm" data-ps-action="reload">Thử lại</button></div>`);
  if (!loaded) return shell(`<div class="ps-blank"><span class="spinner"></span>Đang tải chương trình…</div>`);

  const days = portalStudioDays();
  const day = days.find((item) => item.id === ps.dayId) || days[0] || null;
  const list = days.map((item, index) => {
    const lesson = portalStudioLesson(item.id);
    const activities = lesson ? portalStudioDayActivities(lesson.id) : [];
    const hidden = activities.filter((activity) => activity.status !== "PUBLISHED").length;
    const title = String(item.title || "").trim();
    return `<button type="button" class="ps-day ${day && item.id === day.id ? "active" : ""}" data-ps-day="${escapeHtml(item.id)}" title="${escapeHtml(portalStudioDayLabel(item, index))}"><span class="ps-day-no">${index + 1}</span><span class="ps-day-name">${escapeHtml(title && !/^Buổi\s*\d+$/i.test(title) ? title : `Buổi ${index + 1}`)}</span><span class="ps-day-count ${hidden ? "has-draft" : ""}" title="${activities.length} hoạt động${hidden ? ` · ${hidden} nháp` : ""}">${activities.length}</span></button>`;
  }).join("");
  const left = `<aside class="ps-days"><div class="ps-days-head"><span>Các buổi</span><button class="mini-btn" type="button" data-ps-action="add-day" title="Thêm buổi" ${ps.busy ? "disabled" : ""}>${icon("plus")}</button></div><div class="ps-days-list">${days.length ? list : '<p class="ps-muted">Chưa có buổi nào.</p>'}</div></aside>`;
  const right = day ? portalStudioDayDetail(day, days.indexOf(day)) : `<div class="ps-detail"><div class="ps-blank">Chưa có buổi học. Bấm <b>+</b> để thêm buổi.</div></div>`;
  return shell(`<div class="ps-layout">${left}${right}</div>`);
}

/** Nội dung của một hoạt động hiện thẳng trên trang (không cần mở Sửa mới thấy). */
function portalStudioActivityData(activity) {
  const items = activity.config?.items || [];
  const block = activity.portalBlock;
  if (block === "homework" || (!items.length && activity.config?.content && block !== "phonics_video" && block !== "context_video")) {
    const file = block === "homework" ? activity.config?.mediaUrl : "";
    return `<div class="ps-data-text">${escapeHtml(activity.config?.content || "")}</div>${file ? `<div class="ps-data-file"><span class="badge badge-green">Có phiếu bài tập</span><a href="${escapeHtml(file)}" target="_blank" rel="noopener">${escapeHtml(activity.config?.prompt || "bai-tap.pdf")}</a></div>` : ""}`;
  }
  if (block === "phonics_video" || block === "context_video") {
    const media = activity.config?.mediaUrl;
    return `<div class="ps-data-video">${media ? `<span class="badge badge-green">Đã có video</span><a href="${escapeHtml(media)}" target="_blank" rel="noopener">${escapeHtml(decodeURIComponent(String(media).split("/").pop() || "video"))}</a>` : '<span class="badge badge-amber">Chưa có video</span>'}${activity.config?.content ? `<span class="ps-muted">${escapeHtml(activity.config.content)}</span>` : ""}</div>`;
  }
  if (block === "reader" && !items.length) return `<div class="ps-muted">Sách chưa có trang — bấm Sửa để thêm ảnh bìa và từng trang.</div>`;
  if (!items.length) return '<div class="ps-muted">Chưa có nội dung.</div>';
  if (block === "reader") return `<div class="ps-data-book">${activity.config?.mediaUrl ? `<img class="ps-data-cover" src="${escapeHtml(activity.config.mediaUrl)}" alt="" />` : ""}<ol class="ps-data-lines">${items.map((item) => `<li>${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ""}<span>${escapeHtml(item.prompt)}</span>${item.audio ? `<i title="Có file âm thanh">♪</i>` : ""}</li>`).join("")}</ol></div>`;
  if (block === "flashcard") {
    return `<div class="ps-data-words">${items.map((item) => `<span class="ps-word">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ""}<b>${escapeHtml(item.prompt)}</b>${item.answer ? `<small>${escapeHtml(item.answer)}</small>` : ""}${item.audio ? `<i title="Có file âm thanh">♪</i>` : ""}</span>`).join("")}</div>`;
  }
  return `<ol class="ps-data-lines">${items.map((item) => `<li>${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ""}<span>${escapeHtml(item.prompt)}${item.answer ? ` <small>— ${escapeHtml(item.answer)}</small>` : ""}</span>${item.audio ? `<i title="Có file âm thanh">♪</i>` : ""}</li>`).join("")}</ol>`;
}

function portalStudioDayDetail(day, index) {
  const ps = portalStudio();
  const lesson = portalStudioLesson(day.id);
  const activities = lesson ? portalStudioDayActivities(lesson.id) : [];
  const published = activities.filter((activity) => activity.status === "PUBLISHED").length;
  const cards = activities.map((activity, position) => {
    const block = portalStudioBlock(activity.portalBlock) || PORTAL_STUDIO_BLOCKS[0];
    const live = activity.status === "PUBLISHED";
    return `<article class="ps-act"><header class="ps-act-head"><span class="ps-act-icon">${icon(block.icon)}</span><span class="ps-act-no">${position + 1}</span><strong>${escapeHtml(activity.title || block.title)}</strong><span class="badge badge-slate">${escapeHtml(block.title)}</span><span class="badge ${live ? "badge-green" : "badge-amber"}">${live ? "Đang hiện" : "Nháp"}</span><span class="ps-act-tools"><button class="mini-btn" type="button" data-ps-edit-activity="${escapeHtml(activity.id)}" title="Sửa" ${ps.busy ? "disabled" : ""}>${icon("pencil")}</button><button class="mini-btn" type="button" data-ps-preview="${escapeHtml(activity.id)}" title="Xem như học viên">${icon("eye")}</button><button class="mini-btn ps-mini-text" type="button" data-ps-publish="${escapeHtml(activity.id)}" title="${live ? "Ẩn khỏi học viên" : "Hiện cho học viên"}" ${ps.busy ? "disabled" : ""}>${live ? "Ẩn" : "Hiện"}</button><button class="mini-btn ps-mini-danger" type="button" data-ps-delete-activity="${escapeHtml(activity.id)}" title="Xóa hoạt động" ${ps.busy ? "disabled" : ""}>${icon("trash")}</button></span></header><div class="ps-act-body">${activity.instruction && activity.portalBlock !== "homework" ? `<p class="ps-act-hint">${escapeHtml(activity.instruction)}</p>` : ""}${portalStudioActivityData(activity)}</div></article>`;
  }).join("");
  const addType = portalStudioBlock(ps.addType) ? ps.addType : PORTAL_STUDIO_BLOCKS[0].id;
  const addForm = ps.adding
    ? `<form class="ps-add-form" id="ps-add-form"><select class="input" id="ps-add-type" aria-label="Loại hoạt động">${PORTAL_STUDIO_BLOCKS.map((block) => `<option value="${block.id}" ${block.id === addType ? "selected" : ""}>${escapeHtml(block.title)}</option>`).join("")}</select><input class="input" id="ps-add-name" maxlength="120" value="${escapeHtml(ps.addName || "")}" placeholder="Tên hoạt động (${escapeHtml(portalStudioBlock(addType).title)})" /><button class="primary-btn ps-sm" type="submit">Thêm</button><button class="secondary-btn ps-sm" type="button" data-ps-action="add-cancel">Hủy</button></form>`
    : "";
  const body = activities.length ? cards : `<div class="ps-blank">Buổi này chưa có hoạt động. Bấm <b>Thêm hoạt động</b>.</div>`;
  return `<section class="ps-detail"><header class="ps-detail-head"><span class="ps-detail-no">Buổi ${index + 1}</span><input class="input ps-title-input" id="ps-day-title" value="${escapeHtml(day.title || "")}" placeholder="Tên buổi" aria-label="Tên buổi ${index + 1}" /><button class="mini-btn" type="button" data-ps-action="save-day" title="Lưu tên buổi" ${ps.busy ? "disabled" : ""}>${icon("check")}</button><span class="ps-bar-meta">${activities.length} hoạt động · ${published} đang hiện</span><span class="ps-detail-tools">${ps.adding ? "" : `<button class="primary-btn ps-sm" type="button" data-ps-action="add-activity" ${ps.busy || !lesson ? "disabled" : ""}>${icon("plus")}Thêm hoạt động</button>`}<button class="mini-btn ps-mini-danger" type="button" data-ps-action="delete-day" title="Xóa buổi" ${ps.busy ? "disabled" : ""}>${icon("trash")}</button></span></header>${addForm}<div class="ps-acts">${body}</div></section>`;
}

/* ---------- Soạn khối (modal) ---------- */

function portalStudioBlock(id) {
  return PORTAL_STUDIO_BLOCKS.find((block) => block.id === id);
}

/** Mở khung soạn: `activityId` để sửa hoạt động có sẵn, hoặc `blockId` + `title` để thêm mới. */
function portalStudioOpenEditor({ activityId = "", blockId = "", title = "" } = {}) {
  const ps = portalStudio();
  const day = portalStudioDays().find((item) => item.id === ps.dayId) || portalStudioDays()[0];
  const lesson = day ? portalStudioLesson(day.id) : null;
  if (!lesson) return toast("Buổi này chưa có nội dung bài học — tải lại trang rồi thử lại.");
  const existing = activityId ? portalStudioDayActivities(lesson.id).find((item) => item.id === activityId) : null;
  if (activityId && !existing) return toast("Không tìm thấy hoạt động — tải lại trang rồi thử lại.");
  if (existing) blockId = existing.portalBlock;
  const block = portalStudioBlock(blockId);
  if (!block) return toast("Chọn loại hoạt động.");
  const draft = existing ? structuredClone(existing) : {
    engineType: block.engineType, mode: block.mode, title: String(title || "").trim() || block.title, instruction: "", status: "DRAFT",
    passingScore: 0, starsReward: 5, portalBlock: block.id,
    config: { prompt: "", content: "", mediaUrl: "", items: ["flashcard", "reader", "sentences"].includes(block.id) ? [portalStudioNewItem()] : [] },
  };
  ps.editor = { blockId, lessonId: lesson.id, activityId: existing?.id || "", draft };
  render();
}

function portalStudioNewItem() {
  return { id: newId("item"), prompt: "", answer: "", options: [], image: "", audio: "" };
}

function portalStudioEditorModal() {
  const ps = portalStudio();
  const { blockId, draft } = ps.editor;
  const block = portalStudioBlock(blockId);
  const isVideo = blockId === "phonics_video" || blockId === "context_video";
  const items = draft.config.items || [];
  const mediaCell = (path, value, kind) => {
    const key = `items.${path}.${kind}`;
    const preview = !value ? "" : kind === "image" ? `<img src="${escapeHtml(value)}" alt="" />` : `<audio controls src="${escapeHtml(value)}"></audio>`;
    return `<div class="ps-media">${preview}<button class="secondary-btn" type="button" data-ps-pick="${key}" data-ps-accept="${kind === "image" ? "image/*" : "audio/*"}">${icon("upload")}${value ? "Đổi" : kind === "image" ? "Ảnh" : "Âm thanh"}</button>${value ? `<button class="ps-link" type="button" data-ps-clear="${key}">Bỏ</button>` : ""}<small data-ps-progress="${key}"></small></div>`;
  };
  let body;
  if (isVideo) {
    body = `<div class="ps-video"><div class="ps-video-box">${draft.config.mediaUrl ? `<video controls preload="metadata" src="${escapeHtml(draft.config.mediaUrl)}"></video>` : `<div class="ps-video-empty">${icon("upload")}<span>Chưa có video</span></div>`}</div><div class="ps-video-actions"><button class="primary-btn" type="button" data-ps-pick="mediaUrl" data-ps-accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov">${icon("upload")}${draft.config.mediaUrl ? "Đổi video" : "Tải video lên"}</button><small data-ps-progress="mediaUrl"></small><p class="ps-muted">MP4 khuyên dùng, tối đa 600MB. Video lưu trên máy chủ STEPS.</p></div></div><label class="field"><span>Chữ hiện dưới video (tùy chọn)</span><textarea class="input textarea" data-ps-field="config.content" placeholder="What's your name? — My name is Lan.">${escapeHtml(draft.config.content || "")}</textarea></label>`;
  } else if (blockId === "homework") {
    const file = draft.config.mediaUrl;
    body = `<label class="field"><span>Nội dung nhiệm vụ (mỗi ý một dòng)</span><textarea class="input textarea ps-homework" rows="8" data-ps-field="config.content" placeholder="+ Luyện tập lại từ vựng và mẫu câu đã học theo video hướng dẫn">${escapeHtml(draft.config.content || "")}</textarea></label><div class="field"><span>Phiếu bài tập (PDF) — học viên bấm "Tải bài tập" để tải về in</span><div class="ps-media ps-homework-file">${file ? `<a class="ps-file-chip" href="${escapeHtml(file)}" target="_blank" rel="noopener">${icon("book")}${escapeHtml(draft.config.prompt || "bai-tap.pdf")}</a>` : '<span class="ps-muted">Chưa có file bài tập</span>'}<button class="secondary-btn" type="button" data-ps-pick="mediaUrl" data-ps-accept="application/pdf,.pdf">${icon("upload")}${file ? "Đổi file" : "Tải file PDF"}</button>${file ? `<button class="ps-link" type="button" data-ps-clear="mediaUrl">Bỏ</button>` : ""}<small data-ps-progress="mediaUrl"></small></div></div>`;
  } else {
    const isReader = blockId === "reader" || blockId === "sentences";
    const bookHead = blockId !== "reader" ? "" : `<div class="ps-book-head"><div class="ps-book-cover">${draft.config.mediaUrl ? `<img src="${escapeHtml(draft.config.mediaUrl)}" alt="" />` : `<span>${icon("book")}Ảnh bìa</span>`}</div><div class="ps-book-fields"><div class="ps-media"><button class="secondary-btn" type="button" data-ps-pick="mediaUrl" data-ps-accept="image/*">${icon("upload")}${draft.config.mediaUrl ? "Đổi ảnh bìa" : "Tải ảnh bìa"}</button>${draft.config.mediaUrl ? `<button class="ps-link" type="button" data-ps-clear="mediaUrl">Bỏ</button>` : ""}<small data-ps-progress="mediaUrl"></small></div><label class="field"><span>Dòng tác giả (tùy chọn)</span><input class="input" data-ps-field="config.prompt" value="${escapeHtml(draft.config.prompt || "")}" placeholder="Written by … · Illustrated by …" /></label><label class="field"><span>Từ cần biết (cách nhau dấu phẩy, tùy chọn)</span><input class="input" data-ps-field="config.content" value="${escapeHtml(draft.config.content || "")}" placeholder="boat, dock, fish, lake" /></label><p class="ps-muted">Tên sách = "Tên hiển thị" ở trên. Không có ảnh bìa thì dùng ảnh trang 1.</p></div></div>`;
    const rows = items.map((item, index) => `<div class="ps-row"><span class="ps-row-no">${isReader ? "Trang" : "Thẻ"} ${index + 1}</span>${mediaCell(index, item.image, "image")}<div class="ps-row-fields"><input class="input" data-ps-field="items.${index}.prompt" value="${escapeHtml(item.prompt)}" placeholder="${blockId === "sentences" ? "I see a brown bear." : isReader ? "The blue bike." : "bike"}" /><input class="input" data-ps-field="items.${index}.answer" value="${escapeHtml(item.answer)}" placeholder="${isReader ? "Nghĩa tiếng Việt (tùy chọn)" : "xe đạp (nghĩa, tùy chọn)"}" /></div>${mediaCell(index, item.audio, "audio")}<button class="trash-btn" type="button" data-ps-remove-row="${index}" title="Xóa">${icon("trash")}</button></div>`).join("");
    body = `${bookHead}<div class="ps-rows">${rows}</div><button class="secondary-btn" type="button" data-ps-action="add-row">${icon("plus")}Thêm ${blockId === "sentences" ? "mẫu câu" : isReader ? "trang" : "thẻ"}</button>`;
  }
  const published = draft.status === "PUBLISHED";
  return `<div class="modal-backdrop" data-ps-close="1"><div class="modal-card ps-modal" data-ps-modal role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.hint)}</p></div><button class="close-btn" type="button" data-ps-close="1" aria-label="Đóng">×</button></div><div class="ps-modal-body"><div class="ps-meta"><label class="field"><span>Tên hiển thị cho học viên</span><input class="input" data-ps-field="title" value="${escapeHtml(draft.title)}" /></label><label class="field"><span>Hướng dẫn (tùy chọn)</span><input class="input" data-ps-field="instruction" value="${escapeHtml(draft.instruction || "")}" placeholder="${escapeHtml(blockId === "flashcard" ? "Lật thẻ, nghe và đọc theo." : blockId === "sentences" ? "Xem tranh, bấm Nghe và nói theo." : blockId === "homework" ? "Bố mẹ cùng con làm bài nhé." : blockId === "reader" ? "Đọc từng trang, bấm Nghe để nghe câu." : "Xem video và đọc theo cô.")}" /></label><label class="field ps-stars"><span>Sao thưởng</span><input class="input" type="number" min="0" max="100" data-ps-field="starsReward" value="${Number(draft.starsReward || 0)}" /></label></div>${body}</div><div class="settings-modal-footer"><button class="secondary-btn" type="button" data-ps-close="1">Hủy</button><button class="secondary-btn" type="button" data-ps-save="DRAFT" ${ps.busy ? "disabled" : ""}>Lưu nháp</button><button class="primary-btn" type="button" data-ps-save="PUBLISHED" ${ps.busy ? "disabled" : ""}>${published ? "Lưu" : "Lưu và hiện cho học viên"}</button></div></div></div>`;
}

function portalStudioSetPath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    node = node[key];
    if (node == null) return;
  }
  node[parts[parts.length - 1]] = value;
}

function portalStudioDraftPath(path) {
  // "mediaUrl" → config.mediaUrl; "items.2.image" → config.items.2.image
  return path === "mediaUrl" ? "config.mediaUrl" : path.startsWith("items.") ? `config.${path}` : path;
}

/** Tải file lên /api/media bằng XHR để hiện % (video lớn). */
function portalStudioUpload(file, key) {
  return new Promise((resolveUpload, rejectUpload) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file"));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      PORTAL_STUDIO_PROGRESS[key] = pct;
      const el = document.querySelector(`[data-ps-progress="${key}"]`);
      if (el) el.textContent = `Đang tải ${pct}%`;
    };
    xhr.onload = () => {
      delete PORTAL_STUDIO_PROGRESS[key];
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || "{}"); } catch { payload = {}; }
      if (xhr.status >= 200 && xhr.status < 300 && payload.url) resolveUpload(payload);
      else if (xhr.status === 413) rejectUpload(new Error(payload.error || "File quá lớn so với giới hạn máy chủ."));
      else rejectUpload(new Error(payload.error || `Tải lên lỗi (${xhr.status}).`));
    };
    xhr.onerror = () => { delete PORTAL_STUDIO_PROGRESS[key]; rejectUpload(new Error("Mất kết nối khi tải lên.")); };
    xhr.send(file);
  });
}

async function portalStudioSave(status) {
  const ps = portalStudio();
  const { lessonId, activityId, draft, blockId } = ps.editor;
  const block = portalStudioBlock(blockId);
  const isVideo = blockId === "phonics_video" || blockId === "context_video";
  const items = (draft.config.items || [])
    .map((item) => ({ ...item, prompt: String(item.prompt || "").trim(), answer: String(item.answer || "").trim(), options: item.options || [] }))
    .filter((item) => item.prompt || item.image || item.audio);
  const isText = blockId === "homework";
  if (isVideo && !draft.config.mediaUrl && status === "PUBLISHED") return toast("Chưa tải video lên.");
  if (isText && !String(draft.config.content || "").trim()) return toast("Chưa nhập nội dung nhiệm vụ.");
  if (!isVideo && !isText && !items.length && !(blockId === "reader" && status === "DRAFT")) return toast(`Cần ít nhất một ${blockId === "reader" ? "trang" : "thẻ"}.`);
  const missing = items.findIndex((item) => !item.prompt);
  if (missing >= 0) return toast(`${blockId === "reader" ? "Trang" : "Thẻ"} ${missing + 1} chưa có chữ tiếng Anh.`);
  const activity = {
    ...draft,
    engineType: block.engineType,
    mode: block.mode,
    portalBlock: block.id,
    title: String(draft.title || "").trim() || block.title,
    instruction: String(draft.instruction || "").trim(),
    starsReward: Math.max(0, Math.min(100, Math.round(Number(draft.starsReward) || 0))),
    passingScore: 0,
    status,
    config: { prompt: draft.config.prompt || "", content: String(draft.config.content || ""), mediaUrl: draft.config.mediaUrl || "", items },
  };
  try {
    if (isText) activity.config.items = [];
    await portalStudioMutate({ action: "upsertActivity", lessonId, activityId: activityId || undefined, activity }, status === "PUBLISHED" ? "Đã lưu và hiện cho học viên." : "Đã lưu nháp.");
    ps.editor = null;
    render();
  } catch (error) {
    toast(error.message || "Không lưu được.");
    render();
  }
}

/* ---------- Gắn sự kiện ---------- */

function bindPortalStudioEvents() {
  if (!state.route.startsWith("/soan-portal")) return;
  const ps = portalStudio();
  // Giữ vị trí cuộn của danh sách buổi / hoạt động khi trang vẽ lại (đổi buổi, ẩn/hiện…).
  const daysList = document.querySelector(".ps-days-list");
  const acts = document.querySelector(".ps-acts");
  if (daysList) { daysList.scrollTop = ps.daysScroll || 0; daysList.addEventListener("scroll", () => { ps.daysScroll = daysList.scrollTop; }, { passive: true }); }
  if (acts) {
    if (ps.actsScrollDay === ps.dayId) acts.scrollTop = ps.actsScroll || 0; else { ps.actsScrollDay = ps.dayId; ps.actsScroll = 0; }
    acts.addEventListener("scroll", () => { ps.actsScroll = acts.scrollTop; }, { passive: true });
  }
  document.querySelector("#ps-program")?.addEventListener("change", (event) => {
    ps.syllabusId = event.currentTarget.value;
    ps.doc = null; ps.dayId = ""; ps.error = ""; ps.renaming = false;
    render();
  });
  const nameInput = document.querySelector("#ps-create-name");
  const codeInput = document.querySelector("#ps-create-code");
  nameInput?.addEventListener("input", () => {
    const auto = !ps.createCode || ps.createCode === portalStudioCodeFrom(ps.createName);
    ps.createName = nameInput.value;
    if (auto && codeInput) { ps.createCode = portalStudioCodeFrom(nameInput.value); codeInput.value = ps.createCode; }
  });
  codeInput?.addEventListener("input", () => { ps.createCode = codeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""); });
  document.querySelector("#ps-create-form")?.addEventListener("submit", (event) => { event.preventDefault(); portalStudioCreateProgram(); });
  document.querySelector("#ps-rename-name")?.addEventListener("input", (event) => { ps.renameName = event.currentTarget.value; });
  document.querySelector("#ps-rename-code")?.addEventListener("input", (event) => { ps.renameCode = event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""); event.currentTarget.value = ps.renameCode; });
  document.querySelector("#ps-rename-form")?.addEventListener("submit", (event) => { event.preventDefault(); portalStudioRenameProgram(); });
  document.querySelector("#ps-day-title")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); document.querySelector('[data-ps-action="save-day"]')?.click(); } });
  document.querySelectorAll("[data-ps-day]").forEach((button) => button.addEventListener("click", () => { ps.dayId = button.dataset.psDay; ps.adding = false; render(); }));
  document.querySelectorAll("[data-ps-edit-activity]").forEach((button) => button.addEventListener("click", () => portalStudioOpenEditor({ activityId: button.dataset.psEditActivity })));
  document.querySelector("#ps-add-type")?.addEventListener("change", (event) => {
    ps.addType = event.currentTarget.value;
    const name = document.querySelector("#ps-add-name");
    if (name) name.placeholder = portalStudioBlock(ps.addType)?.title || "";
  });
  document.querySelector("#ps-add-name")?.addEventListener("input", (event) => { ps.addName = event.currentTarget.value; });
  document.querySelector("#ps-add-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const blockId = document.querySelector("#ps-add-type")?.value || PORTAL_STUDIO_BLOCKS[0].id;
    const title = String(document.querySelector("#ps-add-name")?.value || "").trim();
    ps.adding = false; ps.addName = ""; ps.addType = blockId;
    portalStudioOpenEditor({ blockId, title });
  });
  document.querySelectorAll("[data-ps-delete-activity]").forEach((button) => button.addEventListener("click", async () => {
    const day = portalStudioDays().find((item) => item.id === ps.dayId) || portalStudioDays()[0];
    const lesson = day ? portalStudioLesson(day.id) : null;
    const activity = lesson ? portalStudioDayActivities(lesson.id).find((item) => item.id === button.dataset.psDeleteActivity) : null;
    if (!activity) return;
    if (!confirm(`Xóa hoạt động "${activity.title}"? Học viên sẽ không thấy nữa, không hoàn tác được.`)) return;
    try { await portalStudioMutate({ action: "deleteActivity", lessonId: lesson.id, activityId: activity.id }, "Đã xóa hoạt động."); } catch (error) { toast(error.message || "Không xóa được."); }
    render();
  }));
  document.querySelectorAll("[data-ps-preview]").forEach((button) => button.addEventListener("click", () => {
    window.open(`/activity-preview/${encodeURIComponent(ps.doc.meta.id)}/${encodeURIComponent(button.dataset.psPreview)}`, "_blank", "noopener,noreferrer");
  }));
  document.querySelectorAll("[data-ps-publish]").forEach((button) => button.addEventListener("click", async () => {
    const day = portalStudioDays().find((item) => item.id === ps.dayId) || portalStudioDays()[0];
    const lesson = day ? portalStudioLesson(day.id) : null;
    const activity = lesson ? portalStudioDayActivities(lesson.id).find((item) => item.id === button.dataset.psPublish) : null;
    if (!activity) return;
    const status = activity.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    if (status === "PUBLISHED" && activity.engineType === "interactive_video" && !activity.config?.mediaUrl) return toast("Hoạt động này chưa có video — bấm Sửa để tải video lên trước.");
    if (status === "PUBLISHED" && activity.portalBlock === "reader" && !(activity.config?.items || []).length) return toast("Sách chưa có trang — bấm Sửa để thêm ảnh bìa và từng trang trước khi hiện cho học viên.");
    try {
      await portalStudioMutate({ action: "upsertActivity", lessonId: lesson.id, activityId: activity.id, activity: { ...activity, status } }, status === "PUBLISHED" ? "Đã hiện cho học viên." : "Đã ẩn khỏi học viên.");
    } catch (error) { toast(error.message || "Không lưu được."); }
    render();
  }));
  document.querySelectorAll("[data-ps-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.psAction;
    if (action === "reload") { ps.error = ""; return portalStudioLoad(portalStudioSelectedId(), true); }
    if (action === "add-activity") { ps.adding = true; render(); document.querySelector("#ps-add-name")?.focus(); return; }
    if (action === "add-cancel") { ps.adding = false; ps.addName = ""; return render(); }
    if (action === "create-program") { ps.creating = true; ps.createName = ""; ps.createCode = ""; render(); document.querySelector("#ps-create-name")?.focus(); return; }
    if (action === "create-cancel") { ps.creating = false; return render(); }
    if (action === "create-template") return portalStudioCreateFromTemplate();
    if (action === "rename-program") { ps.renaming = true; ps.renameName = ps.doc?.meta?.name || ""; ps.renameCode = ps.doc?.meta?.code || ""; render(); document.querySelector("#ps-rename-name")?.focus(); return; }
    if (action === "rename-cancel") { ps.renaming = false; return render(); }
    if (action === "delete-program") return portalStudioDeleteProgram();
    if (action === "preview-portal") {
      try { state.data = await api("/api/bootstrap"); } catch (error) { return toast(error.message || "Không tải được dữ liệu."); }
      setPortalPreviewProgram(ps.doc.meta.id);
      return go("/portal");
    }
    if (action === "add-day") return portalStudioAddDay();
    if (action === "save-day") {
      const title = String(document.querySelector("#ps-day-title")?.value || "").trim();
      if (!title) return toast("Tên buổi không được để trống.");
      try { await portalStudioMutate({ action: "updateDay", id: ps.dayId, title }, "Đã lưu tên buổi."); } catch (error) { toast(error.message); }
      return render();
    }
    if (action === "delete-day") {
      const days = portalStudioDays();
      const index = days.findIndex((item) => item.id === ps.dayId);
      if (index < 0) return;
      if (!confirm(`Xóa ${portalStudioDayLabel(days[index], index)} cùng toàn bộ nội dung đã soạn? Không hoàn tác được.`)) return;
      try {
        await portalStudioMutate({ action: "deleteDay", id: ps.dayId }, "Đã xóa buổi.");
        ps.dayId = portalStudioDays()[Math.max(0, index - 1)]?.id || "";
      } catch (error) { toast(error.message); }
      return render();
    }
    if (action === "add-row") {
      ps.editor.draft.config.items.push(portalStudioNewItem());
      return render();
    }
  }));

  if (!ps.editor) return;
  const modal = document.querySelector("[data-ps-modal]");
  document.querySelectorAll("[data-ps-close]").forEach((element) => element.addEventListener("click", (event) => {
    if (event.target !== element) return;
    if (Object.keys(PORTAL_STUDIO_PROGRESS).length && !confirm("Đang tải file lên. Đóng sẽ bỏ dở — vẫn đóng?")) return;
    ps.editor = null;
    render();
  }));
  modal?.querySelectorAll("[data-ps-field]").forEach((input) => input.addEventListener("input", () => {
    const value = input.type === "number" ? Number(input.value) : input.value;
    portalStudioSetPath(ps.editor.draft, portalStudioDraftPath(input.dataset.psField), value);
  }));
  modal?.querySelectorAll("[data-ps-remove-row]").forEach((button) => button.addEventListener("click", () => {
    ps.editor.draft.config.items.splice(Number(button.dataset.psRemoveRow), 1);
    render();
  }));
  modal?.querySelectorAll("[data-ps-clear]").forEach((button) => button.addEventListener("click", () => {
    portalStudioSetPath(ps.editor.draft, portalStudioDraftPath(button.dataset.psClear), "");
    render();
  }));
  modal?.querySelectorAll("[data-ps-pick]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.psPick;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = button.dataset.psAccept || "";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const editor = ps.editor;
      button.disabled = true;
      try {
        const uploaded = await portalStudioUpload(file, key);
        if (ps.editor !== editor) return;
        portalStudioSetPath(editor.draft, portalStudioDraftPath(key), uploaded.url);
        // Phiếu bài tập: nhớ tên file gốc để học viên tải về đúng tên.
        if (editor.blockId === "homework" && key === "mediaUrl") editor.draft.config.prompt = String(file.name || "").slice(0, 200);
        toast("Đã tải lên.");
      } catch (error) {
        toast(error.message || "Tải lên lỗi.");
      }
      if (ps.editor === editor) render();
    });
    picker.click();
  }));
  modal?.querySelectorAll("[data-ps-save]").forEach((button) => button.addEventListener("click", () => {
    if (Object.keys(PORTAL_STUDIO_PROGRESS).length) return toast("Đợi tải file xong rồi lưu.");
    portalStudioSave(button.dataset.psSave);
  }));
}

async function portalStudioCreateProgram() {
  const ps = portalStudio();
  if (ps.busy) return;
  const name = String(ps.createName || "").trim();
  const code = String(ps.createCode || portalStudioCodeFrom(name)).trim().toUpperCase();
  if (!name) return toast("Nhập tên chương trình.");
  if (!code) return toast("Nhập mã chương trình.");
  if ((state.data.syllabuses || []).some((item) => String(item.code || "").toUpperCase() === code)) return toast(`Mã ${code} đã có, chọn mã khác.`);
  ps.busy = true;
  render();
  try {
    const result = await api("/api/syllabuses", { method: "POST", body: JSON.stringify({ name, code, level: "Portal", description: `Chương trình ${name} trên Portal học viên: flashcard, phonics, câu ngữ cảnh, đọc sách.`, unitCount: 1 }) });
    state.data.syllabuses = [...(state.data.syllabuses || []), { ...result.item, units: [], wrapDays: [] }];
    ps.syllabusId = result.item.id;
    ps.doc = result.document;
    ps.dayId = "";
    ps.creating = false;
    toast(`Đã tạo chương trình ${name}.`);
  } catch (error) {
    toast(error.message || "Không tạo được chương trình.");
  } finally {
    ps.busy = false;
    render();
  }
}

async function portalStudioAddDay() {
  const ps = portalStudio();
  const doc = ps.doc;
  if (!doc || ps.busy) return;
  try {
    let section = (doc.sections || []).find((item) => item.type === "UNIT") || (doc.sections || [])[0];
    if (!section) {
      await portalStudioMutate({ action: "createSection", type: "UNIT", title: doc.meta.name || "Portal" });
      section = (ps.doc.sections || []).find((item) => item.type === "UNIT") || (ps.doc.sections || [])[0];
      if (!section) throw new Error("Chương trình chưa có Unit để thêm buổi.");
    }
    const days = portalStudioDays();
    const result = await portalStudioMutate({ action: "createDay", sectionId: section.id, unitId: section.unitId || undefined, afterDayId: days[days.length - 1]?.id, title: `Buổi ${days.length + 1}` }, "Đã thêm buổi.");
    ps.dayId = result.id || portalStudioDays()[portalStudioDays().length - 1]?.id || "";
  } catch (error) {
    toast(error.message || "Không thêm được buổi.");
  }
  render();
}

/* ---------- Đổi tên khoá ---------- */

async function portalStudioRenameProgram() {
  const ps = portalStudio();
  const meta = ps.doc?.meta;
  if (!meta || ps.busy) return;
  const name = String(ps.renameName ?? meta.name).trim();
  const code = String(ps.renameCode ?? meta.code).trim().toUpperCase();
  if (!name) return toast("Nhập tên khoá.");
  if (!code) return toast("Nhập mã khoá.");
  if ((state.data.syllabuses || []).some((item) => item.id !== meta.id && String(item.code || "").toUpperCase() === code)) return toast(`Mã ${code} đã có, chọn mã khác.`);
  try {
    await portalStudioMutate({ action: "updateMeta", name, code, level: meta.level, description: meta.description || "", status: meta.status }, "Đã đổi tên khoá.");
    state.data.syllabuses = (state.data.syllabuses || []).map((item) => item.id === meta.id ? { ...item, name, code } : item);
    ps.renaming = false;
  } catch (error) {
    toast(error.message || "Không đổi được tên.");
  }
  render();
}

/* ---------- Tạo khoá theo mẫu (Chương Trình 2021.docx) ---------- */

function portalTemplateHomework(lesson) {
  const notes = String(lesson.notes || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => `- ${line}`).join("\n");
  const parts = [];
  if (notes) parts.push(`Buổi học hôm nay:\n${notes}`);
  if (String(lesson.homework || "").trim()) parts.push(`Nhiệm vụ về nhà:\n${lesson.homework.trim()}`);
  return parts.join("\n\n");
}

/** Các hoạt động của một buổi trong mẫu: Từ vựng → Video Phonics → Mẫu câu → Nhiệm vụ về nhà. */
function portalTemplateActivities(lesson) {
  const base = { instruction: "", passingScore: 0, starsReward: 5 };
  const items = (list) => list.map((entry) => ({ id: newId("item"), prompt: entry.prompt, answer: entry.answer || "", options: [], image: "", audio: "" }));
  const list = [];
  if (lesson.vocab?.length) list.push({ ...base, engineType: "flashcard", mode: "flip", portalBlock: "flashcard", title: "Từ vựng", instruction: "Lật thẻ, nghe và đọc theo.", status: "PUBLISHED", config: { prompt: "", content: "", mediaUrl: "", items: items(lesson.vocab) } });
  if (lesson.phonics) list.push({ ...base, engineType: "interactive_video", mode: "checkpoint", portalBlock: "phonics_video", title: `Jolly Phonics Group 1: ${lesson.phonics}`, instruction: "Xem video và đọc theo cô.", status: "DRAFT", config: { prompt: "", content: `Jolly Phonics Group 1: ${lesson.phonics}`, mediaUrl: "", items: [] } });
  if (lesson.sentences?.length) list.push({ ...base, engineType: "reader", mode: "pages", portalBlock: "sentences", title: "Mẫu câu", instruction: "Xem tranh, bấm Nghe và nói theo.", status: "PUBLISHED", config: { prompt: "", content: "", mediaUrl: "", items: items(lesson.sentences) } });
  const homework = portalTemplateHomework(lesson);
  if (homework) list.push({ ...base, engineType: "reader", mode: "pages", portalBlock: "homework", title: String(lesson.homework || "").trim() ? "Nhiệm vụ về nhà" : lesson.title, starsReward: 0, status: "PUBLISHED", config: { prompt: "", content: homework, mediaUrl: "", items: [] } });
  return list;
}

async function portalStudioCreateFromTemplate() {
  const ps = portalStudio();
  if (ps.busy) return;
  let template;
  try {
    const response = await fetch("/portal-templates/chuong-trinh-2021.json?v=1", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    template = await response.json();
  } catch (error) {
    return toast(`Không tải được mẫu: ${error.message}`);
  }
  const name = String(ps.createName || "").trim() || template.name;
  let code = String(ps.createCode || "").trim().toUpperCase() || template.code;
  const taken = new Set((state.data.syllabuses || []).map((item) => String(item.code || "").toUpperCase()));
  if (taken.has(code)) {
    if (ps.createCode) return toast(`Mã ${code} đã có, chọn mã khác.`);
    let n = 2; while (taken.has(`${template.code}-${n}`)) n += 1; code = `${template.code}-${n}`;
  }
  const lessons = template.lessons || [];
  if (!confirm(`Tạo khoá "${name}" (${code}) gồm ${lessons.length} buổi theo file ${template.source}?`)) return;
  ps.busy = true;
  ps.importing = "Đang tạo khoá…";
  render();
  try {
    const result = await api("/api/syllabuses", { method: "POST", body: JSON.stringify({ name, code, level: "Portal", description: `Khoá ${name} trên Portal học viên — tạo từ ${template.source}.`, unitCount: 1 }) });
    state.data.syllabuses = [...(state.data.syllabuses || []), { ...result.item, units: [], wrapDays: [] }];
    ps.syllabusId = result.item.id;
    ps.doc = result.document;
    ps.creating = false;
    ps.busy = false;
    let section = (ps.doc.sections || []).find((item) => item.type === "UNIT") || (ps.doc.sections || [])[0];
    if (!section) {
      await portalStudioMutate({ action: "createSection", type: "UNIT", title: name });
      section = (ps.doc.sections || []).find((item) => item.type === "UNIT") || (ps.doc.sections || [])[0];
    }
    for (let index = 0; index < lessons.length; index += 1) {
      const lesson = lessons[index];
      ps.importing = `Đang tạo buổi ${index + 1}/${lessons.length}: ${lesson.title}`;
      render();
      const days = portalStudioDays();
      const created = await portalStudioMutate({ action: "createDay", sectionId: section.id, unitId: section.unitId || undefined, afterDayId: days[days.length - 1]?.id, title: lesson.title });
      const lessonRow = portalStudioLesson(created.id);
      if (!lessonRow) throw new Error(`Buổi ${index + 1} chưa có bài học.`);
      for (const activity of portalTemplateActivities(lesson)) {
        await portalStudioMutate({ action: "upsertActivity", lessonId: lessonRow.id, activity });
      }
      if (index === 0) ps.dayId = created.id;
    }
    toast(`Đã tạo khoá ${name}: ${lessons.length} buổi.`);
  } catch (error) {
    toast(`Tạo dở chừng: ${error.message || "lỗi"}. Các buổi đã tạo vẫn giữ — kiểm tra rồi thêm tiếp hoặc xoá khoá.`);
  } finally {
    ps.busy = false;
    ps.importing = "";
    render();
  }
}

/** Xoá chương trình đang chọn. Đang gắn lớp thì không xoá được (máy chủ cũng chặn) — đổi chương trình của lớp trước. */
async function portalStudioDeleteProgram() {
  const ps = portalStudio();
  const meta = ps.doc?.meta;
  if (!meta) return;
  const using = (state.data.classes || []).filter((cls) => cls.syllabusId === meta.id).map((cls) => cls.code || cls.name);
  if (using.length) return toast(`"${meta.name}" đang dùng cho lớp ${using.join(", ")} — vào Lớp học đổi chương trình của lớp đó trước rồi mới xoá.`);
  const days = portalStudioDays().length;
  const acts = (ps.doc.activities || []).length;
  if (!confirm(`Xoá chương trình "${meta.name}"${meta.code ? ` (${meta.code})` : ""} gồm ${days} buổi · ${acts} hoạt động? Toàn bộ nội dung đã soạn sẽ mất, không hoàn tác được.`)) return;
  ps.busy = true;
  render();
  try {
    await api(`/api/syllabuses/${encodeURIComponent(meta.id)}`, { method: "DELETE" });
    state.data.syllabuses = (state.data.syllabuses || []).filter((item) => item.id !== meta.id);
    ps.doc = null;
    ps.syllabusId = "";
    ps.dayId = "";
    toast(`Đã xoá chương trình "${meta.name}".`);
  } catch (error) {
    toast(error.message || "Không xoá được chương trình.");
  } finally {
    ps.busy = false;
    render();
  }
}
