#!/usr/bin/env bash
#
# Triển khai STEPS LMS trên chính VPS. GitHub Actions gọi script này qua
# self-hosted runner, nên toàn bộ việc build diễn ra tại đây.
#
# Thứ tự cố ý: sao lưu database trước khi đụng vào schema, build xong mới
# migrate, migrate xong mới đổi container đang chạy. Hỏng ở bước nào thì
# những bước sau không chạy, và ảnh cũ vẫn còn để quay lại.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

ENV_FILE="${ENV_FILE:-/opt/vsteps/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/vsteps/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

if [ ! -f "$ENV_FILE" ]; then
  echo "LỖI: không tìm thấy $ENV_FILE. Xem docs/DEPLOY.md mục biến môi trường." >&2
  exit 1
fi

compose() { docker compose --env-file "$ENV_FILE" "$@"; }

# Đọc giá trị từ .env như dữ liệu, không `source`. Giá trị có dấu cách (tên người
# quản trị) hoặc ký tự đặc biệt sẽ bị shell diễn dịch thành lệnh nếu source.
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
APP_PORT="$(env_value APP_PORT)"; APP_PORT="${APP_PORT:-3100}"

for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  [ -n "${!name}" ] || { echo "LỖI: $ENV_FILE thiếu $name." >&2; exit 1; }
done

echo "==> 1/6 Sao lưu database"
mkdir -p "$BACKUP_DIR"
if docker ps --format '{{.Names}}' | grep -qx vsteps-postgres; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  docker exec vsteps-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
    > "$BACKUP_DIR/truoc-deploy-$STAMP.dump"
  echo "    đã lưu $BACKUP_DIR/truoc-deploy-$STAMP.dump"
  # Giữ lại KEEP_BACKUPS bản mới nhất, xoá bản cũ hơn.
  ls -1t "$BACKUP_DIR"/truoc-deploy-*.dump 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm --
else
  echo "    chưa có database đang chạy, bỏ qua (lần deploy đầu)"
fi

echo "==> 2/6 Giữ lại ảnh hiện tại để còn quay về"
if docker image inspect vsteps-lms:latest >/dev/null 2>&1; then
  docker tag vsteps-lms:latest vsteps-lms:previous
  HAS_PREVIOUS=1
else
  HAS_PREVIOUS=0
fi

echo "==> 3/6 Build ảnh mới ngay trên VPS"
compose build app

echo "==> 4/6 Khởi động database"
compose up -d postgres

echo "==> 5/6 Áp dụng migration"
# Chạy bằng ảnh vừa build, trong mạng của compose. `prisma migrate deploy` chỉ
# áp dụng các migration chưa chạy; nó không tự tạo hay xoá gì ngoài nội dung
# file migration, nên thêm cột không đụng tới dữ liệu đang có.
compose run --rm --no-deps -T \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public" \
  app ./node_modules/.bin/prisma migrate deploy

echo "==> 6/6 Chuyển sang phiên bản mới"
compose up -d app

echo "==> Kiểm tra sức khoẻ"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "    khoẻ sau ${i}s"
    docker image prune -f >/dev/null 2>&1 || true
    echo "==> Deploy xong."
    exit 0
  fi
  sleep 1
done

echo "LỖI: app không trả lời /api/health sau ${HEALTH_RETRIES}s." >&2
docker compose --env-file "$ENV_FILE" logs --tail 60 app >&2 || true

if [ "$HAS_PREVIOUS" = "1" ]; then
  echo "==> Quay về ảnh trước đó" >&2
  docker tag vsteps-lms:previous vsteps-lms:latest
  compose up -d app
  echo "Đã quay về bản trước. Database KHÔNG được khôi phục tự động:" >&2
  echo "bản sao lưu nằm ở $BACKUP_DIR, khôi phục bằng tay sau khi xem log." >&2
fi
exit 1
