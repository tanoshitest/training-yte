# PLAN --- STEPS LMS INTERACTIVE LEARNING ENGINE

## 1. Mục tiêu

Xây dựng **12 Activity/Game Engines tái sử dụng** cho STEPS LMS. Không
hard-code game theo từng Unit/buổi. Curriculum 100 buổi chỉ cung cấp
content/config.

`Course → Unit → Session → Activity → Engine → Config → Attempt → Result → Mastery → Smart Review`

Nguyên tắc: - Vocabulary, Grammar/Target Language chỉ lấy từ curriculum
đã duyệt. - Vòng xoắn:
`NEW → RECYCLE → RETRIEVE → REUSE → MASTERY CHECK → SPIRAL REVIEW`. -
Một engine dùng lại cho Starter/Movers/Flyers. - Admin có Activity
Builder + Preview, không nhập JSON thủ công. - Portal touch-first, ưu
tiên tablet/mobile. - Activity phải hoạt động thật, không chỉ mock UI.

## 2. 12 Activity Engines

### 01 --- Flashcard Engine

Modes: image→word, word→image, audio→image, listen→flip→word,
listen→repeat, quick flip, mastery review. Tracking: viewed,
correct/incorrect, response time, retry count, mastery. Flow:
`LISTEN → VIEW → FLIP → SEE WORD → SAY → NEXT`.

### 02 --- Audio Choice Engine

Modes: Listen & Tap, Listen & Choose, Sound-to-Picture,
Sentence-to-Picture. Data: audio, prompt, options, correct answer,
feedback, difficulty. Tracking: accuracy, attempts, response time.

### 03 --- Matching Engine

Modes: picture↔word, audio↔picture, sentence↔picture, Memory Match. UI
modes: Connect/Match và Flip-card Memory. Tracking: accuracy, attempts,
completion time.

### 04 --- Drag & Drop Engine

Modes: category sorting, object placement, sequencing, word→picture,
vocabulary classification. Data: draggable_items, drop_zones,
correct_mapping, audio, feedback. Bắt buộc touch-safe.

### 05 --- Sentence Builder Engine

Modes: reorder words, missing word, choose correct word, complete
sentence, picture→sentence. Data: sentence_pattern, tokens, distractors,
audio, image, hint, retry.

### 06 --- Reveal / Retrieval Engine

Modes: What's Missing?, Open the Box, Mystery Card, Guess the Picture,
Reveal Image. Mục tiêu: active retrieval, không chỉ recognition.

### 07 --- Phonics Engine

Modes: Sound Hunt, Sound→Picture, Blend & Choose, Beginning Sound,
Ending Sound, Letter→Sound, Sound→Word. Data: phoneme audio, grapheme,
example words, images, blending audio.

### 08 --- Interactive Video Engine

Video có timeline interaction. Question types: picture choice, MCQ,
Listen & Choose, tap object, prediction, comprehension. Tracking: watch
%, answers, rewatch, completion.

### 09 --- Interactive Song / Chant Engine

Modes: Listen, Repeat Line, Sing, Karaoke, Missing Word, TPR. Lyrics
sync timestamp; highlight câu/từ theo audio.

### 10 --- Speaking Engine

Flow: `LISTEN MODEL → RECORD → PLAYBACK → RETRY → SUBMIT`. Modes: Listen
& Repeat, Say It, Answer Question, Picture Description, Read Aloud,
Role-play. Phase 1 lưu recording + teacher rubric; chuẩn bị interface
cho AI pronunciation scoring.

### 11 --- Mini Reader Engine

Modes: Listen, Read, Record, Vocabulary Hunt. Mỗi page: image, text,
audio, word timestamps, vocabulary hotspots. Flow:
`LISTEN → READ → RECORD → CHECK`.

### 12 --- Quiz Engine

Question types: MCQ, Picture Choice, Audio Choice, True/False, Yes/No,
Sequence, Drag & Drop, Matching, Missing Word, Short Answer, Listening,
Reading Comprehension. Quiz types: Quick Check, Micro Quiz, Unit eQuiz,
Review Quiz, Checkpoint, Final Test. Config: passing_score,
attempt_limit, randomize, feedback, retry_wrong_answers. Default đề
xuất: `passing_score = 80`.

## 3. Smart Review Engine

Smart Review là orchestration layer, không phải game thứ 13.

Mỗi Learning Item có trạng thái:
`NEW | LEARNING | MASTERED | REVIEW_DUE`.

Dữ liệu dùng để chọn bài ôn: - accuracy - last_seen_at -
incorrect_count - response_time - mastery_score - current/previous
unit - next_review_at

Ví dụ học sinh yếu `dog`, `under`, `Where is...?`:
`Flashcard → Listen & Tap → Sentence Builder → Quick Quiz`.

## 4. Learning Item & Spiral Mapping

Mỗi vocabulary/grammar item có ID ổn định: - `VOC_U01_001 = elephant` -
`GRAM_U01_001 = What is this?` - answer pattern = `It is a/an ...`

Không copy cùng một learning item thành nhiều bản giữa các session.

Vòng đời ví dụ: - Offline 1 = NEW - Online 1 = RECYCLE - Online 2 =
RETRIEVE - Offline 2 = REUSE - Online 3 = MASTERY_CHECK - Review Week =
SPIRAL_REVIEW

## 5. Cấu trúc 5 buổi/tuần

### Offline 1

`VIDEO → NEW INPUT → FLASHCARDS → GUIDED GAME → PAIR SPEAKING → EXIT CHECK`

### Online 1

`WATCH → LISTEN → FLASHCARDS → AUDIO GAME → QUICK CHECK`

### Online 2

`RETRIEVE → GAME 1 → GAME 2 → SPEAK → MICRO QUIZ`

### Offline 2

`RETRIEVE → RECYCLE → REUSE → COMMUNICATE → EXIT CHECK`

### Online 3

`PHONICS → LISTEN READER → READ → RECORD → EQUIZ`

## 6. Data Model

### courses

`id, name, code, level, status`

### units

`id, course_id, unit_number, title, order_index`

### sessions

`id, unit_id, week, session_number, mode, purpose, order_index, status`

### learning_items

`id, unit_id, type[vocabulary|grammar|phonics], key, content, answer_pattern, metadata_json`

### session_learning_items

`session_id, learning_item_id, spiral_role[NEW|RECYCLE|RETRIEVE|REUSE|MASTERY_CHECK|SPIRAL_REVIEW]`

### activities

`id, session_id, engine_type, mode, title, instruction, order_index, config_json, required, passing_score, stars_reward, status`

### student_activity_attempts

`id, student_id, activity_id, started_at, completed_at, score, accuracy, attempt_number, answers_json, duration_seconds, stars_earned`

### student_learning_mastery

`student_id, learning_item_id, status, accuracy, attempt_count, correct_count, incorrect_count, last_seen_at, next_review_at, mastery_score`

### media_assets

`id, type[image|audio|video|song|reader], key, url, metadata_json, status`

### assignments

`id, student_or_class_id, session_id, assigned_at, due_at, status`

### rewards

`id, type[star|badge|streak], rule_json, asset_id`

## 7. Activity Registry

Frontend registry:
`flashcard, audio_choice, matching, drag_drop, sentence_builder, reveal, phonics, interactive_video, song, speaking, reader, quiz`.

`ActivityRenderer` nhận `engine_type + mode + config_json` và render
component tương ứng. Không viết logic theo Unit rải rác trong code.

## 8. Admin --- Activity Builder

Admin chọn: 1. Course / Unit / Session 2. Activity Type 3. Game Mode 4.
Learning Items 5. Image / Audio / Video 6. Prompt 7. Options / Correct
Answer 8. Stars 9. Passing Score 10. Preview

Workflow: `DRAFT → REVIEW → PREVIEW → APPROVE → PUBLISH`.

Bắt buộc có **Preview as Student**.

## 9. Activity Template Library

Template reusable: - Listen & Tap --- 4 pictures - Memory --- 6 pairs -
Category Sort --- 3 categories - Sentence Builder - Missing Word -
Speaking --- Listen & Repeat - Reader --- Listen/Read/Record - Quick
Quiz --- 8 questions

Curriculum team chọn template + learning items; hệ thống sinh config.

## 10. AI Activity Generator

AI chỉ tạo **draft activity data**, không tạo source code game mới.

Input: Unit, Session, approved Vocabulary, approved Grammar, Phonics,
skills, difficulty. Output bắt buộc map vào 12 engine types.

Workflow:
`GENERATE → DRAFT → HUMAN REVIEW → PREVIEW → APPROVE → PUBLISH`.

Rules: - Không thêm vocabulary/grammar ngoài approved curriculum. -
Thiếu data → `NEEDS_CONTENT_REVIEW`. - Có log AI-generated /
human-approved.

## 11. Media Library

Quản lý Images, Audio, Video, Songs, Reader pages. Asset có key ổn định
và tái sử dụng ở nhiều activity. Có search, filter, tags, preview, usage
count, replace, draft/published. Không upload nhiều bản trùng nhau.

## 12. Student Portal UX

Ưu tiên tablet → mobile → desktop. - touch targets lớn - không phụ thuộc
hover - drag/drop touch-safe - audio preload hợp lý -
microphone/recording mobile-safe - responsive video - reader
portrait/landscape - autosave + resume - loading/error/retry states -
child-friendly, ít chữ - correct feedback tích cực - incorrect: "Try
again!" - animation ngắn, không gây phân tâm

## 13. Reward & Mastery

Reward: Stars, Badges, Streak, Unit Progress, Course Progress. Không cho
spam activity để farm stars. Mastery theo Learning Item, không chỉ
session completion. Quiz sai phải tác động Smart Review.

## 14. Import Curriculum 100 Buổi

Importer tạo: - Course - 15 Units - 100 Sessions - Learning Items -
spiral mapping - Activity drafts - mastery rules

Không tự thêm Vocabulary/Grammar. Thiếu dữ liệu →
`NEEDS_CONTENT_REVIEW`. Importer phải idempotent, chạy lại không
duplicate.

Validation trước import: - duplicate vocabulary - missing Unit - missing
grammar - missing asset - invalid engine - missing correct answer -
inconsistent spiral role

## 15. API / Service Plan

### Curriculum

courses, units, sessions, learning-items, curriculum-import, validation.

### Activities

templates, CRUD, preview, publish/unpublish, config validation.

### Student

assigned sessions, start activity, submit answer, complete activity,
submit recording, resume.

### Mastery

update/get mastery, smart-review queue, recalculate review schedule.

### Media

upload, browse/search, metadata, usage, replace/archive.

### Progress

student progress, unit progress, course progress, teacher class
overview.

## 16. Development Phases

### Phase 0 --- Foundation

Audit repo; document stack; DB migration strategy; auth/roles; feature
flags; design tokens; engine interfaces; demo seed. **Done:**
architecture chạy mà không phá module hiện tại.

### Phase 1 --- Core Platform

Schema; Activity Registry/Renderer; attempts; mastery base; Session
Player; Activity Builder skeleton; persistence. **Done:** generic
activity render từ DB, submit và lưu kết quả.

### Phase 2 --- Engines 1--4

Flashcard, Audio Choice, Matching, Drag & Drop.

### Phase 3 --- Engines 5--8

Sentence Builder, Reveal, Phonics, Interactive Video.

### Phase 4 --- Engines 9--12

Song/Chant, Speaking, Mini Reader, Quiz.

### Phase 5 --- Learning Intelligence

Smart Review, spaced review, mastery, stars, badges, streak,
assignments, progress.

### Phase 6 --- Curriculum Tools

Excel/CSV importer, 100-session mapping, validation, Template Library,
AI Activity Generator, approval workflow.

### Phase 7 --- Production QA

Test Chrome/Safari/Edge; desktop/tablet/mobile; touch; audio/video;
microphone; refresh/resume; retry; poor network; duplicate submit;
mastery; Smart Review; permissions; accessibility basics.

## 17. Testing Requirements

Mỗi engine cần: - unit tests scoring/config - integration test attempt
submission - e2e happy path - incorrect + retry - persistence/resume -
responsive - touch test nếu có drag - missing media fallback

Quiz/scoring deterministic. Không coi Done nếu chỉ render UI.

## 18. Definition of Done cho mỗi Engine

1.  Render từ DB/config.
2.  Dùng cho nhiều Unit.
3.  Có instruction.
4.  Correct/incorrect feedback.
5.  Submit answer.
6.  Chấm điểm.
7.  Lưu attempt.
8.  Update mastery.
9.  Retry.
10. Resume sau refresh.
11. Responsive.
12. Touch-safe.
13. Admin Preview.
14. Demo data.
15. Tests.
16. Không hard-code Unit vocabulary.

## 19. Repo Structure đề xuất

``` text
apps/
  student-portal/
  admin/
packages/
  activity-core/
  activity-engines/
    flashcard/
    audio-choice/
    matching/
    drag-drop/
    sentence-builder/
    reveal/
    phonics/
    interactive-video/
    song/
    speaking/
    reader/
    quiz/
  curriculum/
  mastery/
  smart-review/
  media/
  rewards/
  shared-ui/
  types/
services/
  curriculum-importer/
  activity-generator/
docs/
  activity-engine-spec/
  curriculum/
  qa/
```

Nếu repo hiện tại khác, **không rewrite repo chỉ để giống cấu trúc
trên**. Audit và map kiến trúc vào codebase hiện có.

## 20. Quy tắc cho Claude Code / Cursor

Trước khi code: 1. Đọc repo liên quan. 2. Xác định stack, auth, DB,
storage, API convention, UI system. 3. Tạo `IMPLEMENTATION_STATUS.md`.
4. Ghi rõ phần đã có / cần tạo. 5. Không đổi framework nếu không cần. 6.
Không phá module/API hiện tại.

Mỗi Phase:
`CHECKLIST → CODE → MIGRATION → SEED → TEST → BUILD → FIX → CHANGELOG → VERIFY → NEXT PHASE`.

Không dùng TODO giả để coi task hoàn thành.

## 21. Acceptance Scenario

### Admin

`Unit → Session → approved learning items → Generate/Build Activities → Preview → Publish`

### Student

`Assignment → Session → Video/Flashcard/Game/Speaking/Reader/Quiz → Result → Stars → Mastery`

### System

`Attempt → Learning Item Mastery → weak item → Smart Review → RECYCLE`

Demo cuối tối thiểu: - 2 Units - 10 Sessions - đủ 12 engines - ≥3
configs/engine - 2 student profiles có kết quả khác nhau - Smart Review
sinh queue khác nhau - Admin xem progress/mastery

## 22. Mục tiêu cuối

Portal phải là **learning engine theo curriculum xoắn ốc**, không phải
bộ game rời rạc:

`NEW → PRACTICE → RETRIEVE → RECYCLE → REUSE → MASTERY → SPIRAL REVIEW`

-   Curriculum quyết định **học cái gì**.
-   12 Activity Engines quyết định **học bằng cách nào**.
-   Mastery + Smart Review quyết định **khi nào cần gặp lại kiến thức
    đó**.

Đây là nền tảng để cùng một LMS dùng lại cho nhiều level/curriculum mà
không phải code lại game.
