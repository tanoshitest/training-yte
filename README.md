# STEPS LMS

Phiên bản độc lập dành cho STEPS. Repository không chứa database, dữ liệu import,
backup, file môi trường hoặc lịch sử Git của dự án nguồn.

Hệ thống quản lý trung tâm Anh ngữ — quản lý **Syllabus, Lớp học, Học viên, Lịch dạy, Điểm danh và Học phí**.

- Hướng dẫn triển khai: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Chấm điểm Phiếu bằng AI (OpenAI), cấu trúc thư mục bài làm: [`docs/huong-dan-cham-phieu-ai.md`](docs/huong-dan-cham-phieu-ai.md)

## Công nghệ

| Thành phần | Lựa chọn |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions) |
| Ngôn ngữ | TypeScript |
| Giao diện | Tailwind CSS v4, màu chủ đạo xanh dương (`brand-600` = `#2563eb`) |
| Cơ sở dữ liệu | PostgreSQL 17 (Docker) |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Xác thực | NextAuth v5 (Credentials + JWT) |
| Kiểm tra dữ liệu | Zod |

## Chạy dự án ở máy local

Yêu cầu: **Node.js 20+**, **Docker Desktop**.

```bash
npm install
```

```bash
cp .env.example .env
```

Mở `.env` và điền `AUTH_SECRET` (sinh bằng lệnh dưới), các giá trị còn lại dùng mặc định được.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Khởi động PostgreSQL:

```bash
npm run db:up
```

> **Máy không chạy được Docker?** Cài PostgreSQL 17 trực tiếp
> (`winget install PostgreSQL.PostgreSQL.17`) và cho nó nghe cổng **5434** để `DATABASE_URL`
> trong `.env` giữ nguyên. Sau đó tạo tài khoản khớp với `docker-compose.yml`:
>
> ```bash
> psql -h localhost -p 5434 -U postgres -c "CREATE ROLE stepslms LOGIN PASSWORD 'stepslms' CREATEDB" -c "CREATE DATABASE stepslms OWNER stepslms"
> ```
>
> Nhớ đặt `listen_addresses = 'localhost'` trong `postgresql.conf` để database không mở ra
> mạng LAN. Bỏ qua `npm run db:up`, các lệnh còn lại giữ nguyên.

Tạo bảng và nạp dữ liệu mẫu:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Chạy ứng dụng:

```bash
npm run dev
```

Mở http://localhost:3000

> **Windows:** chạy `start.bat` là xong — script tự bật PostgreSQL, áp dụng migration,
> nạp dữ liệu sang bảng quan hệ nếu chưa có, rồi khởi động ứng dụng.

### Hai ứng dụng trong repo này

| Lệnh | Chạy cái gì |
| --- | --- |
| `npm run dev` | **Ứng dụng đang dùng thật** — `cloudflare/vps-server.ts`, chính là thứ `Dockerfile.vps` chạy trên production |
| `npm run dev:next` | App Next.js trong `src/` — hiện không được deploy, giữ lại để tham chiếu |

Ứng dụng lưu dữ liệu trong **các bảng quan hệ** (`students`, `classes`,
`lesson_sessions`, `attendances`, `sepay_*`…) ở mọi môi trường. Không cần cấu
hình gì thêm — đó là mặc định.

`STORAGE_MODE=kv` quay về cách lưu cũ (khối JSON trong `vps_app_state`) và chỉ
dành cho một việc: lùi lại khi cắt chuyển một hệ thống đang chạy tầng cũ mà gặp
sự cố. Đừng đặt nó khi vận hành bình thường. Xem
[`docs/system-architecture.md`](docs/system-architecture.md).

### Tài khoản mẫu

> Bảng dưới là tài khoản của app Next.js (`npm run dev:next`). Ứng dụng thật
> (`npm run dev`) đăng nhập bằng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` trong `.env`;
> giáo viên, kế toán và trợ giảng dùng tên đăng nhập sinh từ họ tên trong phần Nhân sự.

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Admin | `admin@stepslms.vn` | `Admin@123` |
| Học vụ | `hocvu@stepslms.vn` | `Academic@123` |
| Giáo viên | `an.nguyen@stepslms.vn` | `Teacher@123` |
| Giáo viên | `binh.tran@stepslms.vn` | `Teacher@123` |
| Giáo viên | `chi.le@stepslms.vn` | `Teacher@123` |

> Đổi mật khẩu mặc định trước khi đưa lên môi trường thật.

## Lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy ứng dụng thật (`cloudflare/vps-server.ts`) tại cổng 3000 |
| `npm run dev:next` | Chạy app Next.js trong `src/` |
| `npm run storage:sync` | Nạp dữ liệu từ khối JSON cũ sang bảng quan hệ rồi đối chiếu |
| `npm run storage:verify` | Chỉ đối chiếu bảng quan hệ với khối JSON cũ |
| `npm run test:storage` | Test tầng lưu trữ quan hệ (tự tạo database test riêng) |
| `npm run build` | Build production (tự chạy `prisma generate`) |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Bật / tắt PostgreSQL trong Docker |
| `npm run db:migrate` | Tạo & áp dụng migration (dev) |
| `npm run db:seed` | Nạp dữ liệu mẫu |
| `npm run db:studio` | Mở Prisma Studio |
| `npm run db:reset` | Xoá sạch DB và chạy lại migration + seed |

## Cloudflare Workers

Dự án còn cấu hình OpenNext/Wrangler (`wrangler.jsonc`, script `deploy`/
`deploy:full`/`upload`/`preview` trong `package.json`) nhưng **chưa xác minh
còn ai dùng đích triển khai này hay không** — đừng coi là đường triển khai
đang hoạt động. `docs/CLOUDFLARE.md` từng mô tả đích này đã bị xoá.

## Cấu trúc thư mục

Ứng dụng đang chạy production thật nằm ở `cloudflare/`, không phải `src/` —
xem [`docs/codebase-summary.md`](docs/codebase-summary.md) để có bản đồ điều
hướng đầy đủ cả hai, và
[`docs/system-architecture.md`](docs/system-architecture.md) để biết vì sao
có hai app song song trong cùng repo.

```
docs/DEPLOY.md           Hướng dẫn triển khai
prisma/schema.prisma     Mô hình dữ liệu
prisma/seed.ts           Dữ liệu mẫu
cloudflare/worker.ts     App thật đang chạy production — API + nghiệp vụ
cloudflare/vps-server.ts Điểm khởi động production, lắp tầng lưu trữ
cloudflare/public/app.js Giao diện app thật (SPA thuần, không framework)
src/app/(app)/           Các trang cần đăng nhập (dùng chung AppShell) — Next.js, hiện không deploy
src/app/dang-nhap/       Trang đăng nhập
src/auth.ts              NextAuth (Node runtime — có Prisma/bcrypt)
src/auth.config.ts       Cấu hình dùng chung, an toàn cho Edge (middleware)
src/middleware.ts        Chặn route theo vai trò
src/lib/permissions.ts   Ma trận phân quyền (PRD §23)
src/lib/tuition.ts       Nghiệp vụ học phí (PRD §13–§16, quy tắc R7–R11)
src/lib/audit.ts         Ghi audit log
src/components/ui/       Design system (Button, Card, Badge, Table, Input…) — dùng chung cả hai app
src/components/layout/   Sidebar + AppShell + cấu hình menu
```

## Nguyên tắc bắt buộc

1. **Syllabus ≠ Lịch dạy.** Sửa lịch (ngày/giờ/phòng/giáo viên) không bao giờ làm đổi nội dung Syllabus.
2. **Chỉ trừ buổi khi buổi học ở trạng thái `COMPLETED`.**
3. **Lớp IELTS tính học phí theo khóa** — tăng số buổi không làm tăng học phí.
4. **Lớp thường vượt gói** sẽ tự sinh khoản phát sinh theo đơn giá trong bảng giá.
5. **Giá không hard-code** — nằm ở `NormalPackage` / `IeltsCourse`.
6. **Backend luôn kiểm tra quyền**, không chỉ ẩn nút trên giao diện.
7. **Giáo viên chỉ thấy lớp và buổi được phân công.**
8. **Ghi audit log** cho thao tác thay đổi dữ liệu quan trọng.
