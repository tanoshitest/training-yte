# Sinh file SQL để nhập học viên vào database production.
#
# Vì sao không chạy thẳng script Prisma trên production: database production chỉ mở
# trong mạng nội bộ Coolify, còn image runtime không có tsx. Cách chắc nhất là sinh
# SQL ở máy dev rồi chạy bằng psql ngay trong container Postgres.
#
# Chạy: python scripts/sinh-sql-hoc-vien.py data/hoc-vien.json data/lop-production.txt data/nhap-hoc-vien.sql
import json
import re
import sys
from collections import defaultdict

nguon, file_lop, dich = sys.argv[1], sys.argv[2], sys.argv[3]


def so_lop(ma):
    """Khoá ghép lớp: số thứ tự lớp + chữ cái phân nhóm ở cuối mã.

    File của trung tâm ghi mã theo kiểu cũ (`IELTS 059 A`, `NT 056`), còn trên hệ thống
    Admin đã đặt lại (`IP 059A`, `NT1B 056`). Chỉ phần số + chữ cái cuối là trùng nhau.
    """
    khop = re.search(r"(\d+)\s*([A-Za-z]?)\s*$", ma.strip())
    return (int(khop.group(1)), khop.group(2).upper()) if khop else None


lop_he_thong = defaultdict(list)
for dong in open(file_lop, encoding="utf-8"):
    ma = dong.strip()
    if ma:
        lop_he_thong[so_lop(ma)].append(ma)

du_lieu = json.load(open(nguon, encoding="utf-8"))

# Gộp dòng trùng (cùng họ tên + cùng SĐT phụ huynh) thành một học viên.
gom = {}
for d in du_lieu["hocVien"]:
    k = (d["hoTen"].lower(), d["sdtPhuHuynh"])
    cu = gom.setdefault(k, {"mau": d, "lop": {}})
    if d["maLop"]:
        cu["lop"][d["maLop"]] = d["soBuoiGoc"]


def nhay(gia_tri):
    if gia_tri is None or gia_tri == "":
        return "NULL"
    return "'" + str(gia_tri).replace("'", "''") + "'"


dong_sql = []
khong_khop = set()
for i, g in enumerate(gom.values(), start=1):
    d = g["mau"]
    ghi_chu = []
    # File chỉ ghi năm sinh nên không đổ vào dateOfBirth (sẽ thành 01/01 giả).
    if d["namSinh"]:
        ghi_chu.append(f"Năm sinh: {d['namSinh']}")
    if d["ghiChu"]:
        ghi_chu.append(d["ghiChu"])

    ghi_danh = []
    for ma_file, buoi in g["lop"].items():
        ung_vien = lop_he_thong.get(so_lop(ma_file), [])
        if len(ung_vien) == 1:
            ghi_danh.append((ung_vien[0], buoi))
        else:
            # Lớp trong file chưa có trên hệ thống: để học viên ở diện chưa xếp lớp và
            # ghi rõ mã lớp gốc, thay vì đoán bừa sang lớp khác.
            khong_khop.add(ma_file)
            ghi_chu.append(f"Lớp trong file: {ma_file} (chưa có trên hệ thống)")

    ma_hv = f"HV{i:04d}"
    dong_sql.append(
        "("
        + ", ".join(
            [
                nhay(ma_hv),
                nhay(d["hoTen"]),
                nhay(d["tenPhuHuynh"]),
                nhay(d["sdtPhuHuynh"]),
                nhay(d["diaChi"]),
                nhay(" · ".join(ghi_chu)),
                nhay(ghi_danh[0][0]) if ghi_danh else "NULL",
                nhay(ghi_danh[0][1]) if ghi_danh and ghi_danh[0][1] else "NULL",
            ]
        )
        + ")"
    )

with open(dich, "w", encoding="utf-8") as f:
    f.write("-- Nhập học viên từ file Excel của trung tâm. Chạy một lần, có thể chạy lại.\n")
    f.write("BEGIN;\n\n")
    f.write(
        "CREATE TEMP TABLE tam_hv (ma text, ho_ten text, ten_ph text, sdt text,"
        " dia_chi text, ghi_chu text, ma_lop text, so_buoi text) ON COMMIT DROP;\n\n"
    )
    f.write(
        "INSERT INTO tam_hv (ma, ho_ten, ten_ph, sdt, dia_chi, ghi_chu, ma_lop, so_buoi) VALUES\n"
    )
    f.write(",\n".join(dong_sql))
    f.write(";\n\n")
    f.write(
        """-- Học viên. Bỏ qua mã đã tồn tại để chạy lại không nhân đôi.
INSERT INTO students (id, code, "fullName", "parentName", "parentPhone", address, note, status, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t.ma, t.ho_ten, t.ten_ph, t.sdt, t.dia_chi, t.ghi_chu,
       (CASE WHEN t.ma_lop IS NULL THEN 'UNASSIGNED' ELSE 'STUDYING' END)::"StudentStatus",
       now(), now()
FROM tam_hv t
ON CONFLICT (code) DO NOTHING;

-- Ghi danh vào lớp đã có sẵn trên hệ thống. Số buổi trong file viết tự do ('33 Buổi',
-- '-2') nên giữ nguyên chuỗi gốc ở ghi chú, học phí thật nhập lại ở màn hình Học phí.
INSERT INTO enrollments (id, "studentId", "classId", status, "joinedAt", note, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s.id, c.id, 'ACTIVE'::"EnrollmentStatus", now(),
       CASE WHEN t.so_buoi IS NULL THEN NULL ELSE 'Số buổi còn lại theo file nhập: ' || t.so_buoi END,
       now(), now()
FROM tam_hv t
JOIN students s ON s.code = t.ma
JOIN classes c ON c.code = t.ma_lop
ON CONFLICT ("studentId", "classId") DO NOTHING;

COMMIT;
"""
    )

print(f"Đã sinh {dich}: {len(dong_sql)} học viên")
if khong_khop:
    print("Lớp trong file chưa có trên hệ thống:", ", ".join(sorted(khong_khop)))
