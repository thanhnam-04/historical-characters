import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Long Vân · Người bạn từ mây",
  description: "Trò chuyện cùng rồng bằng chữ và giọng nói. Không gian riêng cho bạn, công cụ quản trị cho đội ngũ.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head><script type="importmap" dangerouslySetInnerHTML={{__html:JSON.stringify({imports:{three:'/dragon/vendor/three.module.js','three/addons/':'/dragon/vendor/addons/'}})}} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
