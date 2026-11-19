import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "STEPS LMS — Quản lý trung tâm tiếng Anh",
    template: "%s · STEPS LMS",
  },
  description: "Quản lý vận hành trung tâm tiếng Anh trên một nền tảng duy nhất.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
