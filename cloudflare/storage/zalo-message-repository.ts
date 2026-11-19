import type { BlockRepository } from "./block-repository";
import { rowsOf } from "./relational-read";
import { syncTables, withOptional, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

/** Số dòng log gần nhất giữ lại, giống cách `webhookLogs` bị cắt còn 200 ở `worker.ts`. */
const MAX_KEPT_LOGS = 2000;

export interface ZaloMessageLog {
  id: string;
  kind: "PAYMENT_REQUEST" | "INVOICE_ISSUED";
  receivableId?: string;
  invoiceId?: string;
  studentId: string;
  phone: string;
  templateId: string;
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "DELIVERED";
  /** Mốc bắt đầu xử lý — cứu dòng kẹt `PROCESSING` khi tiến trình chết giữa chừng, giống hóa đơn MISA. */
  processingAt?: string;
  providerMsgId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  /** Giá trị điền vào mẫu ZBS lúc gửi (JSON text) — nguồn để xem lại đúng nội dung phụ huynh nhận. */
  templateData?: string;
  /** Ảnh chụp tên/mã học viên và lớp lúc gửi, không đổi theo hồ sơ về sau. */
  studentName?: string;
  studentCode?: string;
  className?: string;
  /** Số thô trong hồ sơ trước khi chuẩn hoá về `84xxxxxxxxx`. */
  rawPhone?: string;
  /** Email nhân viên bấm gửi; trống nghĩa là hệ thống tự gửi. */
  requestedBy?: string;
  /** Số lần đã gọi Zalo cho dòng này (gồm cả lần gửi lại). */
  attemptCount?: number;
  lastAttemptAt?: string;
  /** `sent_time` Zalo trả về khi nhận tin. */
  providerSentTime?: string;
  /** Webhook Zalo gần nhất của tin: mốc nhận và nội dung gốc (đã cắt ngắn). */
  webhookAt?: string;
  webhookPayload?: string;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

type OptionalTextKey =
  | "receivableId" | "invoiceId" | "providerMsgId" | "errorCode" | "errorMessage" | "sentAt" | "deliveredAt" | "processingAt"
  | "templateData" | "studentName" | "studentCode" | "className" | "rawPhone" | "requestedBy" | "lastAttemptAt"
  | "providerSentTime" | "webhookAt" | "webhookPayload";

type ZaloMessageLogRow = Omit<ZaloMessageLog, OptionalTextKey | "attemptCount"> & { [K in OptionalTextKey]: string | null } & {
  attemptCount: number;
};

export const zaloMessageRepository: BlockRepository<ZaloMessageLog[]> = {
  key: "zalo-messages:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<{ logs: ZaloMessageLogRow[] | null }[]>`
      SELECT (SELECT json_agg(z ORDER BY z.position) FROM zalo_message_logs z) AS logs
    `;
    return rowsOf<ZaloMessageLogRow>(result.logs).map((row): ZaloMessageLog => withOptional({
      id: row.id,
      kind: row.kind,
      studentId: row.studentId,
      phone: row.phone,
      templateId: row.templateId,
      status: row.status,
      createdAt: row.createdAt,
    }, {
      receivableId: row.receivableId,
      invoiceId: row.invoiceId,
      providerMsgId: row.providerMsgId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      sentAt: row.sentAt,
      deliveredAt: row.deliveredAt,
      processingAt: row.processingAt,
      templateData: row.templateData,
      studentName: row.studentName,
      studentCode: row.studentCode,
      className: row.className,
      rawPhone: row.rawPhone,
      requestedBy: row.requestedBy,
      lastAttemptAt: row.lastAttemptAt,
      providerSentTime: row.providerSentTime,
      webhookAt: row.webhookAt,
      webhookPayload: row.webhookPayload,
      // 0 là mặc định của cột, coi như chưa ghi nhận lần gọi nào.
      attemptCount: row.attemptCount > 0 ? row.attemptCount : null,
    }));
  },

  async write(tx: TxClient, value: ZaloMessageLog[]) {
    const logs: Row[] = value.slice(0, MAX_KEPT_LOGS).map((row, position) => ({
      id: row.id,
      position,
      kind: text(row.kind),
      receivableId: optionalText(row.receivableId),
      invoiceId: optionalText(row.invoiceId),
      studentId: text(row.studentId),
      phone: text(row.phone),
      templateId: text(row.templateId),
      status: text(row.status),
      providerMsgId: optionalText(row.providerMsgId),
      errorCode: optionalText(row.errorCode),
      errorMessage: optionalText(row.errorMessage),
      createdAt: text(row.createdAt),
      sentAt: optionalText(row.sentAt),
      deliveredAt: optionalText(row.deliveredAt),
      processingAt: optionalText(row.processingAt),
      templateData: optionalText(row.templateData),
      studentName: optionalText(row.studentName),
      studentCode: optionalText(row.studentCode),
      className: optionalText(row.className),
      rawPhone: optionalText(row.rawPhone),
      requestedBy: optionalText(row.requestedBy),
      attemptCount: Number.isFinite(row.attemptCount) ? Math.max(0, Math.trunc(row.attemptCount as number)) : 0,
      lastAttemptAt: optionalText(row.lastAttemptAt),
      providerSentTime: optionalText(row.providerSentTime),
      webhookAt: optionalText(row.webhookAt),
      webhookPayload: optionalText(row.webhookPayload),
    }));

    return syncTables(tx, [
      { name: "zalo_message_logs", delegate: tx.opsZaloMessageLog as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: logs },
    ]);
  },
};
