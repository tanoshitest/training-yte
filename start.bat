@echo off
setlocal
REM Cua so lenh cua Windows mac dinh khong phai UTF-8 nen tieng Viet trong log bi vo.
chcp 65001 >nul

echo ============================================
echo STEPS LMS - Khoi dong moi truong local
echo ============================================

echo.
echo [0/4] Kiem tra tang luu tru...
if not exist ".env" (
  echo   LOI: chua co file .env. Chay: copy .env.example .env roi dien AUTH_SECRET.
  exit /b 1
)
REM Bang quan he la mac dinh. Chi chan khi .env co tinh dat ve kho JSON cu.
findstr /R /C:"^STORAGE_MODE=kv" .env >nul
if not errorlevel 1 (
  echo   LOI: .env dang dat STORAGE_MODE=kv.
  echo   Ung dung chay tren bang quan he o moi moi truong; kv chi la duong lui khi cat chuyen.
  exit /b 1
)
echo   Tang luu tru: bang quan he.

echo.
echo [1/4] PostgreSQL...
docker start stepslms-postgres >nul 2>&1
docker exec stepslms-postgres pg_isready -U stepslms -d stepslms >nul 2>&1
if errorlevel 1 (
  echo   Container chua san sang, dang bat bang docker compose...
  call npm run db:up
  timeout /t 5 /nobreak >nul
  docker exec stepslms-postgres pg_isready -U stepslms -d stepslms >nul 2>&1
  if errorlevel 1 (
    echo   LOI: khong ket noi duoc PostgreSQL. Kiem tra Docker Desktop roi chay lai.
    exit /b 1
  )
)
echo   PostgreSQL san sang.

echo.
echo [2/4] Ap dung migration...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo.
echo [3/4] Nap du lieu sang bang quan he neu chua co...
REM --only-if-empty: nhom nao da co du lieu thi giu nguyen, khong nap de len.
call npx tsx scripts/migrate-kv-to-relational.ts --only-if-empty
if errorlevel 1 exit /b 1

echo.
echo [4/4] Khoi dong ung dung tren bang quan he...
echo   Mo http://localhost:3000
echo   Dung lai: Ctrl+C
echo ============================================
echo.
call npm run dev

endlocal
