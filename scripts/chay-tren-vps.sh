#!/bin/bash
# Chạy một script trong container production (chạy TRÊN VPS). Mặc định scripts/sua-cham-cong-t10-2026.ts;
# chọn script khác: SCRIPT=sua-hang-day-thay.ts bash chay-tren-vps.sh
# Mặc định DRY-RUN. Ghi thật: APPLY=1 bash chay-tren-vps.sh
# Tùy chọn: TEST_14="HH:MM-HH:MM" T14_0710=1 KEEP_TUEAN_0710=1 (truyền qua biến môi trường).
set -e
DB=$(docker inspect vsteps-app --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
NET=$(docker inspect vsteps-app --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
IMG=$(docker inspect vsteps-app --format '{{.Image}}')
docker run --rm --network "$NET" -e DATABASE_URL="$DB" -e APPLY -e TEST_14 -e T14_0710 -e KEEP_TUEAN_0710 \
  -v /tmp/sync-scripts:/app/scripts --entrypoint sh "$IMG" \
  -c "cd /app && node_modules/.bin/tsx scripts/${SCRIPT:-sua-cham-cong-t10-2026.ts}"
