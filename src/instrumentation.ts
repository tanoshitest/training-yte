/**
 * Chạy một lần khi server Next.js khởi động (Next 15 — `instrumentation.ts`).
 *
 * File này được đóng gói cho **cả** Edge runtime (middleware) lẫn Node, mà Prisma +
 * driver `pg` cần các module lõi của Node. Vì vậy phần việc thật nằm ở
 * `instrumentation-node.ts` và chỉ được `import` bên trong nhánh `=== "nodejs"` —
 * viết đúng dạng này thì bundle Edge loại bỏ được nhánh đó lúc build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
