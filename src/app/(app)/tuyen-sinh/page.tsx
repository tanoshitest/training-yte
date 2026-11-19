import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { ModalForm } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, THIndex, TDIndex, EmptyRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PIPELINE_STAGES, STAGE_LABEL, TASK_LABEL } from "@/lib/recruitment";
import { createRecruitmentCase } from "./actions";

export const metadata: Metadata = { title: "Tuyển sinh" };

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; consultant?: string }> }) {
  await requirePermission("recruitment.view");
  const params = await searchParams;
  const stage = PIPELINE_STAGES.includes(params.stage as never) ? params.stage as (typeof PIPELINE_STAGES)[number] : undefined;
  const where = {
    stage: stage ?? { not: "CARE_COMPLETE" as const },
    ...(params.consultant ? { consultantId: params.consultant } : {}),
    ...(params.q ? { OR: [{ fullName: { contains: params.q, mode: "insensitive" as const } }, { phone: { contains: params.q } }, { code: { contains: params.q, mode: "insensitive" as const } }] } : {}),
  };
  const [cases, consultants, branches] = await Promise.all([
    prisma.recruitmentCase.findMany({ where, orderBy: [{ updatedAt: "desc" }], include: { consultant: { select: { fullName: true } }, placementClass: { select: { name: true, code: true } }, tasks: { where: { status: "OPEN" }, select: { kind: true }, take: 1 } } }),
    prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "ACADEMIC"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <>
    <PageHeader title="Quản lý tuyển sinh" description="Danh sách hồ sơ đang chạy. Trạng thái chỉnh trên từng hồ sơ." action={
      <ModalForm action={createRecruitmentCase} title="Tiếp nhận học viên tiềm năng" trigger={<><Plus className="h-4 w-4"/> Thêm hồ sơ</>} submitLabel="Tạo hồ sơ" wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ và tên *"><input name="fullName" required className="input"/></Field>
          <Field label="Số điện thoại *"><input name="phone" required className="input"/></Field>
          <Field label="Ngày tư vấn"><input name="consultationDate" type="date" className="input" defaultValue={new Date().toISOString().slice(0,10)}/></Field>
          <Field label="Năm sinh"><input name="birthYear" type="number" className="input"/></Field>
          <Field label="Lớp/khối"><input name="schoolGrade" className="input" placeholder="Lớp 8, lớp 11..."/></Field>
          <Field label="Trường"><input name="schoolName" className="input"/></Field>
          <Field label="Nhân viên tư vấn"><select name="consultantId" className="input"><option value="">Tự gán cho tôi</option>{consultants.map(x=><option key={x.id} value={x.id}>{x.fullName}</option>)}</select></Field>
          <Field label="Chi nhánh"><select name="branchId" className="input"><option value="">Chưa chọn</option>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        </div>
      </ModalForm>}/>
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input name="q" defaultValue={params.q} className="input min-w-0 flex-1" placeholder="Tìm tên, số điện thoại hoặc mã..."/>
        <select
          name="stage"
          defaultValue={stage ?? ""}
          aria-label="Trạng thái"
          className="h-10 w-full min-w-[22rem] shrink-0 rounded-lg border-2 border-brand-400 bg-brand-50 px-3 pr-10 text-sm font-semibold text-brand-800 shadow-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 lg:w-[26rem]"
        >
          <option value="">Tất cả giai đoạn</option>
          {PIPELINE_STAGES.map(x=><option key={x} value={x}>{STAGE_LABEL[x]}</option>)}
        </select>
        <select name="consultant" defaultValue={params.consultant ?? ""} className="input w-full shrink-0 lg:w-52"><option value="">Tất cả tư vấn viên</option>{consultants.map(x=><option key={x.id} value={x.id}>{x.fullName}</option>)}</select>
        <button className={buttonClass("primary","md")}>Lọc</button>
      </form>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><Table><THead><TR><THIndex/><TH>Mã</TH><TH>Học viên</TH><TH>SĐT</TH><TH>Giai đoạn</TH><TH>Tư vấn viên</TH><TH>Lớp dự kiến</TH><TH>Task tiếp theo</TH></TR></THead><TBody>{cases.map((row,i)=><TR key={row.id}><TDIndex value={i+1}/><TD>{row.code}</TD><TD><Link className="font-medium text-brand-700" href={`/tuyen-sinh/${row.id}`}>{row.fullName}</Link></TD><TD>{row.phone}</TD><TD>{STAGE_LABEL[row.stage]}</TD><TD>{row.consultant?.fullName ?? "—"}</TD><TD>{row.placementClass?.name ?? "—"}</TD><TD>{row.tasks[0] ? TASK_LABEL[row.tasks[0].kind] : "—"}</TD></TR>)}{!cases.length?<EmptyRow colSpan={8}>Không có hồ sơ phù hợp.</EmptyRow>:null}</TBody></Table></div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>; }
