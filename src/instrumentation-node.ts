/**
 * Việc chạy lúc khởi động server, phía Node (gọi từ `instrumentation.ts`).
 *
 * Việc duy nhất ở đây: đẩy chân trời buổi học của mọi lớp đang chạy tiến lên. Lớp
 * không có ngày kết thúc nên buổi chỉ được dựng trước `PLAN_HORIZON_DAYS` ngày; mỗi
 * lần khởi động đẩy mốc này lên theo ngày hôm nay để lớp không bao giờ hết buổi mà
 * không cần ai mở từng lớp ra bấm Lưu.
 *
 * Chạy nền, không chặn khởi động, và lỗi ở đây không được làm app chết — cùng lắm là
 * chân trời đứng yên, lần khởi động sau thử lại. Đặt `SKIP_SESSION_BACKFILL=true`
 * để tắt hẳn.
 */
import { backfillClassSessions } from "@/lib/class-plan";
import { prisma } from "@/lib/prisma";

if (process.env.SKIP_SESSION_BACKFILL !== "true") {
  void backfillClassSessions(prisma)
    .then(({ classes, sessions }) => {
      if (classes > 0) {
        console.log(`→ Đã dựng thêm ${sessions} buổi cho ${classes} lớp.`);
      }
    })
    .catch((error) => {
      console.error("Không đẩy được chân trời buổi học:", error);
    });
}
