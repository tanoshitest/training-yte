# Đồng bộ dữ liệu giữa các máy

Mang dữ liệu đang chạy thật từ máy này sang máy khác: xem lại ở local, dựng máy
mới, hoặc cắt chuyển người dùng sang hạ tầng mới.

Đây **không phải** quy trình deploy. Deploy mã nguồn xem [`DEPLOY.md`](DEPLOY.md).

## Các máy

| Máy | Kết nối | Container PostgreSQL | User / DB | Tầng lưu trữ |
| --- | --- | --- | --- | --- |
| **Hệ thống cũ** (đang phục vụ trung tâm) | `root@149.28.131.241`, MCP `mcp-ssh-steps` | do Coolify sinh tên, xem cách tìm bên dưới | `steps` / `steps_lms` | JSON (`vps_app_state`) |
| **Máy mới** `ngoaingusteps.edu.vn` | `root@163.61.72.30`, MCP `mcp-ssh-bnixvsteps` | `vsteps-postgres` | `vsteps` / `vsteps` | Quan hệ |
| **Local** | Docker Desktop | `stepslms-postgres` | `stepslms` / `stepslms` | Quan hệ |

Tên container PostgreSQL trên máy cũ do Coolify sinh ngẫu nhiên và **đổi sau mỗi
lần Coolify dựng lại**. Tìm lại bằng:

```bash
ssh root@149.28.131.241 "docker ps --filter ancestor=postgres:17-alpine --format '{{.Names}}'"
```

## Nguyên tắc

**Chỉ chép bảng `vps_app_state`, không restore toàn bộ database.** Máy cũ còn ở
38 migration, máy mới và local đã 44 — restore đè cả schema sẽ kéo máy đích lùi
về schema cũ và làm hỏng tầng quan hệ.

Toàn bộ dữ liệu nghiệp vụ của máy cũ nằm gọn trong 27 khối JSON của bảng đó; mọi
bảng quan hệ trên máy cũ đều rỗng. Chép khối JSON sang rồi để script
`storage:sync` dựng lại tầng quan hệ trên máy đích.

Script chỉ chép, không tính lại giá trị nào, và tự đối chiếu sau khi chuyển. Máy
đích vẫn chạy `STORAGE_MODE=relational` như bình thường — không bật `kv`.

## Quy trình

Đặt trước hai biến cho gọn:

```bash
NGUON=root@149.28.131.241
PG_NGUON=$(ssh $NGUON "docker ps --filter ancestor=postgres:17-alpine --format '{{.Names}}'")
```

### 1. Sao lưu máy đích

Bắt buộc, kể cả khi đích là local.

```bash
# Đích là local
docker exec stepslms-postgres pg_dump -U stepslms -d stepslms -Fc -f /tmp/backup.dump
docker cp stepslms-postgres:/tmp/backup.dump ./backup-local-$(date +%y%m%d-%H%M).dump

# Đích là máy mới
ssh root@163.61.72.30 "docker exec vsteps-postgres pg_dump -U vsteps -d vsteps -Fc \
  -f /tmp/b.dump && docker cp vsteps-postgres:/tmp/b.dump \
  /opt/vsteps/backups/truoc-dong-bo-\$(date +%y%m%d-%H%M).dump"
```

### 2. Dump khối JSON từ máy nguồn

```bash
ssh $NGUON "docker exec $PG_NGUON pg_dump -U steps -d steps_lms --data-only \
  --table=vps_app_state --no-owner --no-privileges -f /tmp/kv.sql \
  && docker cp $PG_NGUON:/tmp/kv.sql /tmp/kv.sql && md5sum /tmp/kv.sql"
scp $NGUON:/tmp/kv.sql ./kv.sql
```

File khoảng 9–10 MB. **Đối chiếu md5 sau khi tải về** — dump đứt giữa chừng vẫn
nạp được một phần mà không báo lỗi gì.

### 3. Nạp vào máy đích

`TRUNCATE` rồi `COPY` trong **một transaction**: hỏng ở giữa thì quay lại nguyên
trạng, không để lại nửa vời.

```bash
# Đích là local
docker cp ./kv.sql stepslms-postgres:/tmp/kv.sql
docker exec stepslms-postgres psql -U stepslms -d stepslms \
  --single-transaction -v ON_ERROR_STOP=1 -c "TRUNCATE vps_app_state" -f /tmp/kv.sql

# Đích là máy mới — dừng app trước để không ai ghi vào giữa chừng
scp ./kv.sql root@163.61.72.30:/tmp/kv.sql
ssh root@163.61.72.30 "docker stop vsteps-app \
  && docker cp /tmp/kv.sql vsteps-postgres:/tmp/kv.sql \
  && docker exec vsteps-postgres psql -U vsteps -d vsteps \
       --single-transaction -v ON_ERROR_STOP=1 \
       -c 'TRUNCATE vps_app_state' -f /tmp/kv.sql"
```

Kết quả phải là `COPY 27`.

### 4. Đổ sang bảng quan hệ

Đích là local thì chạy thẳng:

```bash
npm run storage:sync
```

**Đích là máy từ xa thì phải chạy script ngay trên máy đó**, không chạy từ local
qua đường hầm SSH. Script ghi mỗi nhóm trong một transaction Prisma với hạn mức
mặc định 5 giây; nhóm Tài chính mất ~3,5 giây khi kết nối nội bộ, nhưng qua
đường hầm thì độ trễ mạng đẩy nó vượt 5 giây và transaction bị huỷ:

```
Transaction API error: A query cannot be executed on an expired transaction.
```

Lỗi này không làm hỏng dữ liệu — nhóm đang dở bị quay lui nguyên vẹn — nhưng các
nhóm chạy trước đó đã ghi rồi, nên database nằm ở trạng thái nửa vời cho tới khi
chạy lại cho xong.

Ảnh Docker production có sẵn `tsx`, `dotenv` và Prisma client đã sinh, chỉ thiếu
hai file script. Đưa chúng lên rồi chạy trong một container dùng chung mạng với
PostgreSQL (app vẫn đang dừng từ bước 3):

```bash
ssh root@163.61.72.30 "mkdir -p /tmp/sync-scripts"
scp scripts/migrate-kv-to-relational.ts scripts/kv-relational-diff.ts \
  root@163.61.72.30:/tmp/sync-scripts/

ssh root@163.61.72.30 'DB=$(docker inspect vsteps-app --format "{{range .Config.Env}}{{println .}}{{end}}" | grep "^DATABASE_URL=" | cut -d= -f2-); \
  NET=$(docker inspect vsteps-app --format "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}{{end}}"); \
  IMG=$(docker inspect vsteps-app --format "{{.Image}}"); \
  docker run --rm --network "$NET" -e DATABASE_URL="$DB" \
    -v /tmp/sync-scripts:/app/scripts --entrypoint sh "$IMG" \
    -c "cd /app && node_modules/.bin/tsx scripts/migrate-kv-to-relational.ts"'
```

Script phải kết thúc bằng `KẾT QUẢ: toàn bộ 9 nhóm khớp tuyệt đối`. Còn nhóm nào
lệch là dừng lại, đừng bật app lên.

Bật app trở lại nếu đã dừng ở bước 3:

```bash
ssh root@163.61.72.30 "docker start vsteps-app"
```

### 5. Đối chiếu với máy nguồn

Script ở bước 4 đã đối chiếu khối JSON với bản dựng lại. Kiểm thêm một lần trên
chính bảng quan hệ của máy đích, so với máy nguồn:

```bash
# Máy nguồn (tầng JSON)
ssh $NGUON "docker exec $PG_NGUON psql -U steps -d steps_lms -c \
  \"select s->>'date' ngay, count(*) buoi, \
     sum(jsonb_array_length(coalesce(s->'attendance','[]'::jsonb))) diem_danh \
   from vps_app_state, jsonb_array_elements(value) s \
   where key='kv:sessions%3Asteps-demo' and s->>'date' >= '2026-09-15' \
   group by 1 order by 1\""

# Máy đích (tầng quan hệ) — đổi psql cho đúng container/user
docker exec stepslms-postgres psql -U stepslms -d stepslms -c \
  "select s.date ngay, count(distinct s.id) buoi, count(a.*) diem_danh \
   from lesson_sessions s left join attendances a on a.\"sessionId\" = s.id \
   where s.date >= '2026-09-15' group by 1 order by 1"
```

Hai bảng phải trùng từng dòng.

### 6. Dọn

Xoá `/tmp/kv.sql` ở mọi nơi đã đi qua — máy nguồn, máy đích, bên trong hai
container PostgreSQL, và bản tải về ở local — cùng `/tmp/sync-scripts`. File dump
chứa toàn bộ dữ liệu học viên. Giữ lại bản sao lưu ở bước 1.

## Dữ liệu sẽ mất những gì

Bước 3 xoá sạch `vps_app_state` của máy đích, bước 4 ghi đè toàn bộ tầng quan hệ.
**Mọi thao tác người dùng làm trên máy đích sau thời điểm dump đều mất.**

Kiểm tra trước xem máy đích có dữ liệu nghiệp vụ mới không:

```bash
docker exec vsteps-postgres psql -U vsteps -d vsteps -c \
  "select entity, count(*), max(\"createdAt\") from audit_logs \
   where entity <> 'User' group by 1 order by 2 desc limit 5"
```

Có thao tác mới sau mốc dump thì dừng lại và quyết định bằng tay — quy trình này
là một chiều, không trộn dữ liệu hai bên.

## Bản chụp là ảnh tĩnh

Máy cũ vẫn chạy và giáo viên vẫn điểm danh. Bản vừa đồng bộ lệch dần kể từ giây
dump. Cắt chuyển người dùng sang máy mới thì phải chạy lại quy trình này **lần
cuối ngay trước khi đổi tên miền**, sau khi máy cũ đã ngừng nhận thao tác.

## Đường lùi

Giữ nguyên dữ liệu trong `vps_app_state` ở máy đích — đó là đường lùi
`STORAGE_MODE=kv` khi tầng quan hệ gặp sự cố. Xem
[`system-architecture.md`](system-architecture.md).

Hỏng nặng thì phục hồi bản sao lưu ở bước 1 theo mục *Sao lưu và phục hồi* trong
[`DEPLOY.md`](DEPLOY.md).
