import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comfy Studio — 상상을, 이미지로",
  description: "모델과 프롬프트만 고르면, 나만의 이미지가 완성되는 크리에이티브 스튜디오.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
    >
      <body>{children}</body>
    </html>
  );
}
