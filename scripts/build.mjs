/**
 * Chạy `next build` với mức heap phù hợp RAM của máy đang build.
 *
 * Bước "Linting and checking validity of types" của Next ăn nhiều RAM hơn heap
 * mặc định, nên máy dev 8GB chết giữa chừng với "JavaScript heap out of memory"
 * (build worker exit 134).
 *
 * Nhưng **không** được đặt cứng một con số: máy build ít RAM (VPS) mà bị ép heap
 * lớn hơn RAM thật thì V8 không dọn rác sớm, cứ xin thêm bộ nhớ cho tới khi cả
 * container build bị kernel giết — log không kịp in dòng lỗi nào, Coolify chỉ
 * báo `docker exec ... (exit code 255)`. Vì thế mức heap tính theo `os.totalmem()`,
 * và máy quá ít RAM thì trả quyền tự chọn lại cho Node.
 *
 * Phải bọc qua script Node thay vì viết thẳng `NODE_OPTIONS=... next build` vào
 * package.json, vì trên Windows npm chạy script bằng cmd.exe — cú pháp
 * `BIEN=giá_trị lệnh` chỉ đúng với shell kiểu Unix.
 *
 * Đặt cứng mức heap khi cần bằng biến môi trường `BUILD_HEAP_MB`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);

/** Trần heap: hơn mức này thì bước build của Next cũng không nhanh thêm. */
const MAX_HEAP_MB = 4096;
/** Dưới mức này thì heap tự chọn của Node đã sát RAM rồi, ép thêm chỉ hại. */
const MIN_HEAP_MB = 2048;

const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
const override = Number(process.env.BUILD_HEAP_MB);

// Chừa ~30% RAM cho hệ điều hành, tiến trình con của Next và bộ nhớ ngoài heap.
const autoHeapMb = Math.min(MAX_HEAP_MB, Math.floor(totalMb * 0.7));
const heapMb = Number.isFinite(override) && override > 0
  ? override
  : autoHeapMb >= MIN_HEAP_MB
    ? autoHeapMb
    : 0;

const env = { ...process.env };
if (heapMb > 0) {
  // Next chạy bước kiểm tra kiểu ở tiến trình con, chỉ NODE_OPTIONS mới truyền được xuống.
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--max-old-space-size=${heapMb}`]
    .filter(Boolean)
    .join(" ");
  console.log(`[build] RAM máy ${totalMb}MB → heap ${heapMb}MB`);
} else {
  console.log(`[build] RAM máy ${totalMb}MB → để Node tự chọn heap`);
}

// Gọi thẳng file JS của Next bằng chính Node đang chạy: không cần shell (tránh
// cảnh báo DEP0190) và không phụ thuộc vào .bin/next của từng hệ điều hành.
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "build"], { stdio: "inherit", env });

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
