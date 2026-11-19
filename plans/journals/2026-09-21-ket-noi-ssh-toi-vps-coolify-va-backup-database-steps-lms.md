---
title: Ket noi SSH toi VPS Coolify va backup database steps_lms
date: 2026-09-21
summary: "Thiet lap MCP SSH toi VPS production (Vultr, Coolify), xu ly loi auth, backup DB + config deploy ve local"
---

# Ket noi SSH toi VPS Coolify va backup database steps_lms

## Boi canh

VPS production (149.28.131.241, nha cung cap Vultr) chay Coolify 4.3.17 tu host,
deploy app `steps-lms` tu GitHub (nhanh `main`). Can ket noi SSH qua MCP de thao
tac server, sau do backup database va cau hinh deploy ve may local.

## Nhung gi da lam

### 1. Tao MCP SSH server `mcp-ssh-steps`
- Them entry moi vao `.claude.json` (`mcpServers.mcp-ssh-steps`) dung goi `ssh-mcp`.
- Lan dau cau hinh voi `--password=...` tren CLI: that bai vi `ssh-mcp` v2 da
  loai bo hoan toan flag `--password`/`--sudoPassword` tren CLI (ly do bao mat,
  tranh lo qua `ps aux`). Phai truyen qua bien moi truong `SSH_MCP_PASSWORD` /
  `SSH_MCP_SUDO_PASSWORD`.

### 2. Phat hien server chi chap nhan SSH key, khong chap nhan password
- Sau khi sua sang bien moi truong, van khong connect duoc: MCP bao
  `SSH connection error: All configured authentication methods failed`.
- Probe truc tiep bang `ssh -o PreferredAuthentications=none root@149.28.131.241`
  tra ve `Permission denied (publickey)` — xac nhan server (Vultr mac dinh) da
  tat han dang nhap bang password qua SSH, chi con publickey.
- `ssh-copy-id` cung khong dung duoc vi chinh no can dang nhap bang password de
  copy key moi vao — bi tu choi ngay tu buoc bat tay giao thuc.

### 3. Giai phap: them SSH key qua Web Console (khong qua SSH)
- Nguoi cam VPS dang nhap Vultr Web Console (VNC, khong qua SSH nen khong bi
  chan boi PasswordAuthentication=no), tu tay them public key
  (`~/.ssh/id_ed25519.pub` cua may nay) vao `~/.ssh/authorized_keys` cua root.
- Sau do sua `mcp-ssh-steps` sang dung `--key=C:\Users\Administrator\.ssh\id_ed25519`
  thay vi password/env var, bo hoan toan `SSH_MCP_PASSWORD`.
- Verify thanh cong: `ssh -i ~/.ssh/id_ed25519 root@149.28.131.241` va
  `mcp__mcp-ssh-steps__open-session` deu ket noi duoc.

### 4. Backup database + config deploy tu Coolify
Kiem tra ha tang qua `docker ps` + `docker inspect` (labels Coolify):
- App container: `sqwjepnuzk3jz7x4xmap9hcn-105427707716`
  (`coolify.resourceName=steps-lmsmain-sqwjepnuzk3jz7x4xmap9hcn`,
  `coolify.applicationId=1`) — khong co volume mount, source code khong luu
  rieng tren server (build image tu GitHub moi lan deploy).
- Database: `mlb89lqiyw7uxvugdmqun14r` (`coolify.resourceName=steps-postgres`,
  Postgres 17, db `steps_lms`, user `steps`), co volume rieng cho
  `/var/lib/postgresql/data`, dung luong ~19MB.
- Container `steps-lms-student-contact-c9c5511` dung chung DATABASE_URL voi app
  chinh nhung khong co label Coolify va khong co volume — nghi la ban
  test/preview thu cong, chua ro nguon goc, can hoi lai chu du an.

Quy trinh backup da chay:
1. `pg_dump -U steps -d steps_lms -F c` (custom format) trong container ->
   `docker cp` ra host `/root/backups/<timestamp>/`.
2. Copy them 3 file cau hinh Coolify sinh ra:
   `/data/coolify/applications/sqwjepnuzk3jz7x4xmap9hcn/{docker-compose.yaml,.env,README.md}`.
3. Ghi `DEPLOYED_COMMIT.txt` (SOURCE_COMMIT=8c87c3612e2301ec0b3347af5a036be4009fa601,
   branch main) de doi chieu voi repo local.
4. Tai ve local qua `scp` (MCP `sftp-download-file` bi tu choi tren Windows vi
   khong xac minh duoc quyen thu muc dich — day la gioi han cua ssh-mcp, khong
   phai loi cau hinh).
5. Xoa sach thu muc tam tren server sau khi tai xong.

Ket qua luu tai: `D:\WEB\THANHNGUYEN\steps-lms\backups\20260921-085915\`
(`backups/` da co san trong `.gitignore`, khong lo commit nham secrets).

## Quyet dinh

- Dung SSH key thay vi password cho `mcp-ssh-steps`, khop voi cach cac profile
  SSH khac trong `.claude.json` da lam (chuan bao mat hon, dung theo README cua
  `ssh-mcp` v2).
- Backup dung `pg_dump -F c` (custom format) thay vi plain SQL de nen va restore
  nhanh bang `pg_restore`.
- Backup file `.env` cua Coolify vi day la nguon that su cua secrets runtime,
  khong nam trong git repo.

## Van de con mo

- Container `steps-lms-student-contact-c9c5511` la gi, co con dung khong, co
  can dep khong (khong duoc Coolify quan ly, khong co volume).
- Chua thiet lap backup dinh ky tu dong (Coolify ho tro scheduled backup cho
  database, day duoc len S3/local) — hien tai moi la backup thu cong 1 lan.
- Chua doi chieu commit local (`D:\WEB\THANHNGUYEN\steps-lms`) voi commit dang
  chay production (`8c87c3612e2301ec0b3347af5a036be4009fa601`, branch main).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
