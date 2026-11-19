import "dotenv/config";

import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { nextStudentCode } from "@/lib/code";

/**
 * Nhập hàng loạt học viên từ file Excel của trung tâm.
 *
 * Chạy `python scripts/doc-file-hoc-vien.py <file.xlsx> data/hoc-vien.json` trước,
 * rồi:
 *   npx tsx scripts/import-hoc-vien.ts            → chỉ xem trước, không ghi gì
 *   npx tsx scripts/import-hoc-vien.ts --ghi      → ghi vào database
 *
 * Chạy lại nhiều lần không nhân đôi dữ liệu: lớp khớp theo mã, học viên khớp theo
 * (họ tên + SĐT phụ huynh), ghi danh đã có `@@unique([studentId, classId])`.
 *
 * Không tạo học phí (StudentTuition): cột "Học phí" trong file trống hoàn toàn và
 * gói buổi phải chọn từ NormalPackage / IeltsCourse (Nguyên tắc 5: không hard-code
 * giá). Số buổi trong file được ghi vào ghi chú ghi danh để không mất dữ liệu.
 */

type DongFile = {
  dong: number;
  hoTen: string;
  ngaySinh: string | null;
  namSinh: number | null;
  tenPhuHuynh: string | null;
  sdtPhuHuynh: string | null;
  diaChi: string | null;
  ghiChu: string | null;
  maLop: string | null;
  soBuoiConLai: number | null;
  soBuoiGoc: string | null;
};

const GHI = process.argv.includes("--ghi");
const NGUON = process.argv.find((a) => a.endsWith(".json")) ?? "data/hoc-vien.json";

/** Lớp IELTS nhận diện theo tiền tố mã; các mã còn lại (NK/NT/NPK…) là lớp thường. */
function loaiLop(ma: string) {
  return /^ielts/i.test(ma) ? "IELTS" : "NORMAL";
}

/** Khoá so trùng: cùng tên và cùng SĐT phụ huynh thì coi là một học viên. */
function khoa(hoTen: string, sdt: string | null) {
  return `${hoTen.toLowerCase()}|${sdt ?? ""}`;
}

function ghiChuHocVien(d: DongFile) {
  const phan: string[] = [];
  // File chỉ ghi năm sinh, không có ngày/tháng nên không đổ vào `dateOfBirth`
  // (sẽ hiện thành 01/01 giả). Giữ nguyên năm ở ghi chú cho đúng dữ liệu gốc.
  if (d.namSinh) phan.push(`Năm sinh: ${d.namSinh}`);
  if (d.ghiChu) phan.push(d.ghiChu);
  return phan.length ? phan.join(" · ") : null;
}

async function main() {
  const { hocVien } = JSON.parse(readFileSync(NGUON, "utf-8")) as { hocVien: DongFile[] };

  const maLop = [...new Set(hocVien.map((d) => d.maLop).filter((m): m is string => Boolean(m)))].sort();

  const lopDaCo = await prisma.class.findMany({
    where: { code: { in: maLop } },
    select: { id: true, code: true },
  });
  const lopTheoMa = new Map(lopDaCo.map((l) => [l.code, l.id]));
  const lopCanTao = maLop.filter((m) => !lopTheoMa.has(m));

  // Gom các dòng trùng (họ tên + SĐT) thành một học viên, giữ danh sách lớp của họ.
  const gom = new Map<string, { mau: DongFile; lop: Set<string>; soBuoi: Map<string, string> }>();
  for (const d of hocVien) {
    const k = khoa(d.hoTen, d.sdtPhuHuynh);
    const cu = gom.get(k) ?? { mau: d, lop: new Set<string>(), soBuoi: new Map<string, string>() };
    if (d.maLop) {
      cu.lop.add(d.maLop);
      if (d.soBuoiGoc) cu.soBuoi.set(d.maLop, d.soBuoiGoc);
    }
    gom.set(k, cu);
  }

  const dsDaCo = await prisma.student.findMany({
    select: { id: true, fullName: true, parentPhone: true },
  });
  const hvTheoKhoa = new Map(dsDaCo.map((s) => [khoa(s.fullName, s.parentPhone), s.id]));

  const canTao = [...gom.entries()].filter(([k]) => !hvTheoKhoa.has(k));
  const daCo = gom.size - canTao.length;

  console.log(`File: ${hocVien.length} dòng → ${gom.size} học viên (đã gộp ${hocVien.length - gom.size} dòng trùng tên+SĐT)`);
  console.log(`Lớp: ${maLop.length} mã, đã có ${lopDaCo.length}, cần tạo ${lopCanTao.length}`);
  if (lopCanTao.length) {
    console.log(
      "  " +
        lopCanTao.map((m) => `${m} (${loaiLop(m) === "IELTS" ? "IELTS" : "lớp thường"})`).join(", "),
    );
  }
  console.log(`Học viên: cần tạo ${canTao.length}, đã có trong hệ thống ${daCo}`);
  console.log(`Chưa xếp lớp: ${[...gom.values()].filter((g) => g.lop.size === 0).length}`);

  if (!GHI) {
    console.log("\n(Xem trước — chưa ghi gì. Thêm --ghi để nhập thật.)");
    return;
  }

  for (const ma of lopCanTao) {
    const lop = await prisma.class.create({
      data: {
        code: ma,
        name: ma,
        type: loaiLop(ma),
        // Chi nhánh / giáo viên / phòng file không có, Admin gán sau trong màn hình lớp.
        status: "ACTIVE",
      },
      select: { id: true, code: true },
    });
    lopTheoMa.set(lop.code, lop.id);
  }
  console.log(`Đã tạo ${lopCanTao.length} lớp.`);

  // Sinh mã một lần rồi tăng dần trong bộ nhớ, thay vì hỏi database 488 lần.
  let so = Number.parseInt((await nextStudentCode()).slice(2), 10);
  let taoMoi = 0;
  let ghiDanh = 0;

  for (const [k, g] of gom) {
    const d = g.mau;
    let studentId = hvTheoKhoa.get(k);

    if (!studentId) {
      const hv = await prisma.student.create({
        data: {
          code: `HV${String(so++).padStart(4, "0")}`,
          fullName: d.hoTen,
          dateOfBirth: d.ngaySinh ? new Date(d.ngaySinh) : null,
          parentName: d.tenPhuHuynh,
          parentPhone: d.sdtPhuHuynh,
          address: d.diaChi,
          note: ghiChuHocVien(d),
          status: g.lop.size ? "STUDYING" : "UNASSIGNED",
        },
        select: { id: true },
      });
      studentId = hv.id;
      hvTheoKhoa.set(k, studentId);
      taoMoi += 1;
    }

    for (const ma of g.lop) {
      const classId = lopTheoMa.get(ma);
      if (!classId) continue;
      const buoi = g.soBuoi.get(ma);
      const kq = await prisma.enrollment.createMany({
        data: [
          {
            studentId,
            classId,
            status: "ACTIVE",
            // Số buổi trong file viết tự do ('33 Buổi', '-2') và có thể âm khi học
            // vượt gói. Giữ nguyên chuỗi gốc, học phí thật nhập lại ở màn hình Học phí.
            note: buoi ? `Số buổi còn lại theo file nhập: ${buoi}` : null,
          },
        ],
        skipDuplicates: true,
      });
      ghiDanh += kq.count;
    }
  }

  console.log(`Đã tạo ${taoMoi} học viên, ${ghiDanh} lượt ghi danh.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
