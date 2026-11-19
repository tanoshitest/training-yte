import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gói server thành bản standalone: Next dò dấu vết (file tracing) và chỉ chép
  // đúng những module thực sự được import vào `.next/standalone`.
  // Image runtime nhờ đó bỏ được `next` và `@next/swc-*` (chỉ dùng lúc build),
  // nhỏ đi vài trăm MB — quan trọng vì máy build chỉ có ~1GB RAM và từng chết
  // ở bước "exporting layers". Xem docs/DEPLOY.md mục 6.
  output: "standalone",
  // Prisma 7 runtime không được webpack đóng gói — tránh client cũ sau khi generate.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  experimental: {
    // File mẫu + 500 dòng học viên vẫn nhỏ, nhưng để dư so với trần 5MB lúc đọc file.
    serverActions: { bodySizeLimit: "6mb" },
  },
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/dang-nhap",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
