import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { PlacementClassFields } from "@/components/recruitment/placement-class-fields";
import { LeadStageSelect } from "@/components/recruitment/lead-stage-select";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { STAGE_LABEL } from "@/lib/recruitment";
import { timeToMinutes, WEEKDAY_SHORT } from "@/lib/utils";
import {
  deleteRecruitmentCase,
  saveRecruitmentAssessment,
  saveRecruitmentIntake,
  saveRecruitmentOnboarding,
  saveRecruitmentTuition,
  waiveRecruitmentTest,
} from "../actions";

const PAYMENT_LABEL = { UNPAID: "Chưa đóng", DEPOSIT: "Đặt cọc", PARTIAL: "Đóng một phần", PAID: "Đã đóng đủ", REFUNDED: "Hoàn tiền" } as const;
const dateValue = (value: Date | null) => value ? value.toISOString().slice(0,10) : "";
const moneyValue = (value: { toString(): string } | null) => value?.toString() ?? "";
const FIELD_CLASS = "block h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-[13px] font-normal text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function localDateValue(value: Date | null) {
  if (!value) return "";
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localTimeValue(value: Date | null) {
  if (!value) return "";
  const hours = value.getHours();
  const minutes = value.getMinutes();
  if (hours === 0 && minutes === 0) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default async function RecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("recruitment.view");
  const { id } = await params;
  const [lead, consultants, branches, classes] = await Promise.all([
    prisma.recruitmentCase.findUnique({ where: { id }, include: { consultant: { select: { fullName: true } }, placementClass: { select: { name: true } } } }),
    prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN","ACADEMIC"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.class.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        schedules: { select: { weekday: true, startTime: true, endTime: true } },
      },
    }),
  ]);
  if (!lead) notFound();
  const classOptions = classes.map(({ schedules, ...item }) => ({
    ...item,
    scheduleLabel: schedules
      .toSorted((a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map((slot) => `${WEEKDAY_SHORT[slot.weekday]} ${slot.startTime}-${slot.endTime}`)
      .join(" · "),
  }));
  const testLabel = lead.testScheduledAt
    ? ` · Test ${localDateValue(lead.testScheduledAt)}${localTimeValue(lead.testScheduledAt) ? ` ${localTimeValue(lead.testScheduledAt)}` : ""}`
    : lead.testWaived ? " · Không test" : "";
  const afterLock = lead.stage === "LOCKED" || lead.stage === "PLACED" || lead.stage === "FIRST_MONTH_CARE" || lead.stage === "CARE_COMPLETE";

  return <>
    <Link href="/tuyen-sinh" className="mb-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"><ArrowLeft className="h-3.5 w-3.5"/> Danh sách tuyển sinh</Link>
    <PageHeader
      className="mb-3"
      title={`${lead.fullName} · ${lead.code}`}
      description={`${lead.phone} · ${STAGE_LABEL[lead.stage]}${testLabel}`}
      action={
        <div className="flex items-center gap-2">
          <LeadStageSelect key={lead.stage} id={lead.id} stage={lead.stage} />
          <ActionForm action={deleteRecruitmentCase} redirectOnSuccessField="_successHref">
            <input type="hidden" name="id" value={lead.id} />
            <input type="hidden" name="_successHref" value="/tuyen-sinh" />
            <SubmitButton type="submit" size="sm" variant="danger" confirm={`Xóa lead ${lead.fullName}? Task và lịch sử chăm sóc liên quan cũng sẽ bị xóa.`}>
              <Trash2 className="h-4 w-4" />
              Xóa lead
            </SubmitButton>
          </ActionForm>
        </div>
      }
    />

    <div className="space-y-3">
      <Section title="1. Lấy thông tin - hẹn test">
        <ActionForm action={saveRecruitmentIntake} className="space-y-3">
          <input type="hidden" name="id" value={lead.id}/>
          <Grid cols={3}>
            <Field label="Họ và tên *"><input name="fullName" required defaultValue={lead.fullName} className={FIELD_CLASS}/></Field>
            <Field label="Số điện thoại *"><input name="phone" required defaultValue={lead.phone} className={FIELD_CLASS}/></Field>
            <Field label="Năm sinh"><input name="birthYear" type="number" defaultValue={lead.birthYear ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Lớp/khối"><input name="schoolGrade" defaultValue={lead.schoolGrade ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Trường"><input name="schoolName" defaultValue={lead.schoolName ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Chi nhánh"><select name="branchId" defaultValue={lead.branchId ?? ""} className={FIELD_CLASS}><option value="">Chưa chọn</option>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Nhân viên tư vấn"><select name="consultantId" defaultValue={lead.consultantId ?? ""} className={FIELD_CLASS}><option value="">Chưa phân công</option>{consultants.map(x=><option key={x.id} value={x.id}>{x.fullName}</option>)}</select></Field>
            <Field label="Lịch sử học"><input name="learningHistory" defaultValue={lead.learningHistory ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Hẹn ngày test">
              <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-1.5">
                <input name="testScheduledAt" type="date" defaultValue={localDateValue(lead.testScheduledAt)} className={FIELD_CLASS} disabled={lead.testWaived}/>
                <input name="testScheduledTime" type="time" defaultValue={localTimeValue(lead.testScheduledAt)} className={FIELD_CLASS} aria-label="Giờ hẹn test" disabled={lead.testWaived}/>
              </div>
            </Field>
          </Grid>
          <p className="text-[12px] text-slate-500">{lead.testWaived ? "Học sinh được bỏ test đầu vào." : "Lưu ngày + giờ test sẽ chuyển sang Chờ test."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <SubmitButton size="sm">Lưu thông tin</SubmitButton>
          </div>
        </ActionForm>
        {lead.testWaived ? null : (
          <ActionForm action={waiveRecruitmentTest} className="flex justify-end">
            <input type="hidden" name="id" value={lead.id}/>
            <SubmitButton size="sm" variant="outline">Không test</SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title={afterLock ? "2. Kết quả test & xếp lớp chính thức" : "2. Kết quả test & lớp đề xuất"}>
        <ActionForm action={saveRecruitmentAssessment} className="space-y-3">
          <input type="hidden" name="id" value={lead.id}/>
          <Grid>
            <Field label="Đánh giá"><input name="assessment" defaultValue={lead.assessment ?? ""} className={FIELD_CLASS} placeholder="Kết quả nghe, nói, đọc, viết..."/></Field>
            <PlacementClassFields
              key={`${lead.stage}-${lead.placementClassId ?? ""}`}
              classes={classOptions}
              defaultClassId={lead.placementClassId ?? ""}
              defaultSchedule={lead.proposedSchedule ?? ""}
              fieldClassName={FIELD_CLASS}
            />
          </Grid>
          <p className="text-[12px] text-slate-500">{afterLock ? "Lớp lúc test chỉ là đề xuất. Sau khi chốt gói, chọn lại lớp chính thức tại đây." : "Lưu kết quả test để chuyển sang Tư vấn học phí."}</p>
          <div className="flex justify-end"><SubmitButton size="sm">Lưu kết quả test</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="3. Tư vấn học phí">
        <ActionForm action={saveRecruitmentTuition} className="space-y-3">
          <input type="hidden" name="id" value={lead.id}/>
          <Grid>
            <Field label="Gói đăng ký"><input name="registrationPackage" defaultValue={lead.registrationPackage ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Học phí"><input name="tuitionAmount" defaultValue={moneyValue(lead.tuitionAmount)} className={FIELD_CLASS} inputMode="numeric"/></Field>
            <Field label="Giáo trình"><input name="textbookAmount" defaultValue={moneyValue(lead.textbookAmount)} className={FIELD_CLASS} inputMode="numeric"/></Field>
            <Field label="Giảm giá"><input name="discountAmount" defaultValue={moneyValue(lead.discountAmount)} className={FIELD_CLASS} inputMode="numeric"/></Field>
            <Field label="Lý do giảm"><input name="discountReason" defaultValue={lead.discountReason ?? ""} className={FIELD_CLASS}/></Field>
            <Field label="Trạng thái học phí"><select name="paymentStatus" defaultValue={lead.paymentStatus} className={FIELD_CLASS}>{Object.entries(PAYMENT_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Đã đóng"><input name="paidAmount" defaultValue={moneyValue(lead.paidAmount)} className={FIELD_CLASS} inputMode="numeric"/></Field>
            <Field label="Ghi chú học phí"><input name="tuitionNote" defaultValue={lead.tuitionNote ?? ""} className={FIELD_CLASS}/></Field>
          </Grid>
          <p className="text-[13px] text-slate-500">Tổng tư vấn: <strong className="text-slate-900">{Number(lead.quotedTotal ?? 0).toLocaleString("vi-VN")} đ</strong></p>
          <div className="flex justify-end"><SubmitButton size="sm">Lưu gói học phí</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="4. Nhập học">
        <ActionForm action={saveRecruitmentOnboarding} className="space-y-3">
          <input type="hidden" name="id" value={lead.id}/>
          <Grid>
            <Field label="Ngày bắt đầu"><input name="expectedStartDate" type="date" defaultValue={dateValue(lead.expectedStartDate)} className={FIELD_CLASS}/></Field>
            <div className="sm:col-span-2"><Field label="Ghi chú"><input name="lostReason" defaultValue={lead.lostReason ?? ""} className={FIELD_CLASS}/></Field></div>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3 xl:grid-cols-5">
              <Check name="textbookIssued" label="Đã phát giáo trình" checked={!!lead.textbookIssuedAt}/>
              <Check name="photoReceived" label="Đã nhận hình 3x4" checked={!!lead.photoReceivedAt}/>
              <Check name="zaloAdded" label="Đã vào nhóm Zalo" checked={!!lead.zaloAddedAt}/>
              <Check name="attendanceListAdded" label="Đã thêm DS điểm danh" checked={!!lead.attendanceListAddedAt}/>
              <Check name="consultantConfirmed" label="Tư vấn viên xác nhận" checked={!!lead.consultantConfirmedAt}/>
            </div>
          </Grid>
          <p className="text-[12px] text-slate-500">Khi đã đóng đủ học phí, phát giáo trình và có lớp chính thức, hồ sơ tự chuyển sang Đã nhập học - Chăm sóc tháng đầu.</p>
          <div className="flex justify-end"><SubmitButton size="sm">Lưu nhập học</SubmitButton></div>
        </ActionForm>
      </Section>
    </div>
  </>;
}

function Section({ title, children }: { title:string; children:React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-200 px-4 py-2 text-sm font-semibold">{title}</h2><div className="space-y-2 px-4 py-3">{children}</div></section>;
}
function Grid({ children, cols = 2 }: { children:React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cols === 3 ? "grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-x-4 gap-y-2 sm:grid-cols-2"}>{children}</div>;
}
function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return <label className="space-y-1 text-[13px] font-medium text-slate-700"><span className="block">{label}</span>{children}</label>;
}
function Check({ name,label,checked }: { name:string; label:string; checked:boolean }) {
  return <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px]"><input type="checkbox" name={name} defaultChecked={checked}/>{label}</label>;
}
