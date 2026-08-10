import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "다이어터를 위한 냉장고를 부탁해",
  description:
    "냉장고 사진을 찍으면 내가 고른 다이어트 모드에 맞는 요리를 영양 정보와 함께 골라드려요",
  appleWebApp: {
    capable: true,
    title: "냉장고를 부탁해",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17151a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
