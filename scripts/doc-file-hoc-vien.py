# Đọc file Excel danh sách học viên của trung tâm và xuất ra JSON để script import dùng.
# Chạy: python scripts/doc-file-hoc-vien.py "<đường dẫn file .xlsx>" data/hoc-vien.json
#
# Vì sao cần bước này: dự án đã bỏ exceljs (Coolify build hết RAM) nên Node không đọc
# được .xlsx. Tách phần đọc file sang Python, phần ghi database vẫn do Prisma làm.
import json
import re
import sys
from datetime import datetime

from openpyxl import load_workbook

nguon = sys.argv[1]
dich = sys.argv[2]

wb = load_workbook(nguon, data_only=True)
ws = wb["Học viên"]

# Cột "Mã lớp" được gộp ô theo từng khối lớp: chỉ dòng đầu khối có giá trị.
# Trải giá trị ra mọi dòng trong khối, nếu không 470/488 học viên sẽ mất lớp.
o_gop = {}
for vung in ws.merged_cells.ranges:
    dau = ws.cell(row=vung.min_row, column=vung.min_col).value
    if vung.min_col <= 8 <= vung.max_col:
        for dong in range(vung.min_row, vung.max_row + 1):
            o_gop[dong] = dau


def chu(gia_tri):
    if gia_tri is None:
        return None
    van_ban = re.sub(r"\s+", " ", str(gia_tri)).strip()
    return van_ban or None


def ma_lop(gia_tri):
    van_ban = chu(gia_tri)
    if not van_ban:
        return None
    # Dữ liệu gõ tay còn sót dấu "\" ở cuối (VD "NT 023\").
    return van_ban.rstrip("\\/").strip() or None


def so_dien_thoai(gia_tri):
    if gia_tri is None:
        return None
    van_ban = re.sub(r"\D", "", str(gia_tri))
    if not van_ban:
        return None
    # Excel lưu SĐT dạng số nên số 0 đầu bị mất: 912345678 → 0912345678.
    if len(van_ban) in (9, 10) and not van_ban.startswith("0"):
        van_ban = "0" + van_ban
    return van_ban


def ngay_sinh(gia_tri):
    """Trả về (ngày sinh đầy đủ, năm sinh). File hiện chỉ ghi năm."""
    if gia_tri is None:
        return None, None
    if isinstance(gia_tri, datetime):
        return gia_tri.date().isoformat(), gia_tri.year
    van_ban = str(gia_tri).strip()
    if re.fullmatch(r"(19|20)\d{2}", van_ban):
        return None, int(van_ban)
    return None, None


def so_buoi(gia_tri):
    """Số buổi còn lại, có thể âm (học vượt gói). Chấp nhận '33 Buổi', '35', '-2'."""
    if gia_tri is None:
        return None, None
    goc = str(gia_tri).strip()
    if not goc:
        return None, None
    khop = re.search(r"-?\d+", goc)
    return (int(khop.group()) if khop else None), goc


hoc_vien = []
for dong in range(3, ws.max_row + 1):
    ten = chu(ws.cell(row=dong, column=2).value)
    if not ten:
        continue
    day_du, nam = ngay_sinh(ws.cell(row=dong, column=3).value)
    con_lai, goc_buoi = so_buoi(ws.cell(row=dong, column=10).value)
    hoc_vien.append(
        {
            "dong": dong,
            "maHocVien": chu(ws.cell(row=dong, column=1).value),
            "hoTen": ten,
            "ngaySinh": day_du,
            "namSinh": nam,
            "tenPhuHuynh": chu(ws.cell(row=dong, column=4).value),
            "sdtPhuHuynh": so_dien_thoai(ws.cell(row=dong, column=5).value),
            "diaChi": chu(ws.cell(row=dong, column=6).value),
            "ghiChu": chu(ws.cell(row=dong, column=7).value),
            "maLop": ma_lop(o_gop.get(dong, ws.cell(row=dong, column=8).value)),
            "hocPhi": chu(ws.cell(row=dong, column=9).value),
            "soBuoiConLai": con_lai,
            "soBuoiGoc": goc_buoi,
        }
    )

lop = sorted({h["maLop"] for h in hoc_vien if h["maLop"]})
with open(dich, "w", encoding="utf-8") as f:
    json.dump({"lop": lop, "hocVien": hoc_vien}, f, ensure_ascii=False, indent=1)

print(f"Đã đọc {len(hoc_vien)} học viên, {len(lop)} lớp → {dich}")
print("Lớp:", ", ".join(lop))
print("Không có lớp:", sum(1 for h in hoc_vien if not h["maLop"]))
