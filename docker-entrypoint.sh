#!/bin/sh
set -e

# Gọi thẳng binary trong node_modules thay vì `npx`: `npx` không thấy gói ở máy
# sẽ đi tải từ registry, mà container lúc khởi động không nên phụ thuộc mạng.
PRISMA=./node_modules/.bin/prisma

# Áp dụng migration trước khi khởi động app.
# Đặt RUN_MIGRATIONS=false nếu muốn chạy migration thủ công.
if [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "→ Đang áp dụng migration…"
  "$PRISMA" migrate deploy
fi

# Import syllabus data only when explicitly requested. Production for the
# operations modules must not mutate curriculum data on every container restart.
if [ "$RUN_SYLLABUS_IMPORT" = "true" ]; then
  echo "-> Importing versioned syllabuses..."
  ./node_modules/.bin/tsx scripts/import-syllabuses.ts
fi

# Chạy seed một lần duy nhất khi bật RUN_SEED=true (nhớ tắt lại sau khi xong).
if [ "$RUN_SEED" = "true" ]; then
  echo "→ Đang nạp dữ liệu mẫu…"
  # Gọi binary bằng đường dẫn tuyệt đối tương đối với WORKDIR. Prisma `db seed`
  # spawn chuỗi `tsx prisma/seed.ts` từ prisma.config.ts và không tự thêm
  # node_modules/.bin vào PATH khi entrypoint chạy trực tiếp trong container.
  ./node_modules/.bin/tsx prisma/seed.ts
fi

exec "$@"
