"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  fail,
  requiredId,
  runAction,
  type ActionState,
} from "@/lib/form-utils";

/**
 * Server Action cho module kế toán — đối soát thu chi.
 *
 * Dữ liệu tài chính được lưu trong VpsAppState với key "finance:steps-demo".
 * Mỗi nghiệp vụ thu chi có entryId tương ứng trong cashbook.
 * reconEntries lưu trạng thái đối soát: MATCHED (đã khớp) hoặc PENDING (chưa khớp).
 */

const FINANCE_KEY = "finance:steps-demo";

type CashEntry = {
  id: string;
  date: string;
  kind: "IN" | "OUT";
  source: "TUITION" | "MANUAL";
  category: string;
  description: string;
  amount: number;
  method: string;
  studentName?: string;
  tuitionId?: string;
  receiptId?: string;
};

type ReconEntry = {
  entryId: string;
  status: "MATCHED" | "PENDING";
  amount: number;
  date: string;
  approvedAt?: string;
  approvedBy?: string;
};

type FinanceData = {
  cashbook: CashEntry[];
  reconEntries: ReconEntry[];
};

/**
 * Đọc dữ liệu tài chính từ VpsAppState
 */
async function getFinanceData(): Promise<FinanceData | null> {
  const state = await prisma.vpsAppState.findUnique({
    where: { key: FINANCE_KEY },
  });
  if (!state) return null;
  return state.value as FinanceData;
}

/**
 * Lưu dữ liệu tài chính vào VpsAppState
 */
async function saveFinanceData(value: FinanceData) {
  await prisma.vpsAppState.upsert({
    where: { key: FINANCE_KEY },
    create: { key: FINANCE_KEY, value },
    update: { value },
  });
}

/**
 * Duyệt một nghiệp vụ thu chi
 */
export async function approveReconEntry(state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("tuition.manage");
    const entryId = requiredId(formData, "entryId", "nghiệp vụ");

    const finance = await getFinanceData();
    if (!finance) {
      return fail("Không tìm thấy dữ liệu tài chính");
    }

    const cashbook = finance.cashbook || [];
    const entry = cashbook.find((e) => e.id === entryId);
    if (!entry) {
      return fail("Không tìm thấy nghiệp vụ thu chi");
    }

    const reconEntries = finance.reconEntries || [];
    const existing = reconEntries.find((r) => r.entryId === entryId);
    const approvedBy = user.fullName || user.email || "Kế toán";

    const updatedReconEntries = reconEntries.map((r) => {
      if (r.entryId === entryId) {
        return {
          entryId: r.entryId,
          status: "MATCHED" as const,
          amount: Math.round(Number(entry.amount) || 0),
          date: entry.date,
          approvedAt: new Date().toISOString(),
          approvedBy,
        };
      }
      return r;
    });

    // Nếu chưa có, thêm mới
    if (!existing) {
      updatedReconEntries.push({
        entryId,
        status: "MATCHED",
        amount: Math.round(Number(entry.amount) || 0),
        date: entry.date,
        approvedAt: new Date().toISOString(),
        approvedBy,
      });
    }

    finance.reconEntries = updatedReconEntries;
    await saveFinanceData(finance);

    revalidatePath("/ke-toan/doi-soat");
    revalidatePath("/ke-toan/thu-chi");
  });
}

/**
 * Hoàn tác duyệt một nghiệp vụ thu chi
 */
export async function undoReconEntry(state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("tuition.manage");
    const entryId = requiredId(formData, "entryId", "nghiệp vụ");

    const finance = await getFinanceData();
    if (!finance) {
      return fail("Không tìm thấy dữ liệu tài chính");
    }

    const cashbook = finance.cashbook || [];
    const entry = cashbook.find((e) => e.id === entryId);
    if (!entry) {
      return fail("Không tìm thấy nghiệp vụ thu chi");
    }

    const reconEntries = finance.reconEntries || [];
    const updatedReconEntries = reconEntries.map((r) => {
      if (r.entryId === entryId) {
        return {
          entryId: r.entryId,
          status: "PENDING" as const,
          amount: Math.round(Number(entry.amount) || 0),
          date: entry.date,
        };
      }
      return r;
    });

    finance.reconEntries = updatedReconEntries;
    await saveFinanceData(finance);

    revalidatePath("/ke-toan/doi-soat");
    revalidatePath("/ke-toan/thu-chi");
  });
}
