import { Pwa } from "@/components/pwa";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#101112'};
export const metadata: Metadata = {
  applicationName:'Comfy Studio',
  appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Comfy Studio'},
  icons:{apple:'/icons/apple-touch-icon.png'},
  title: "Comfy Studio — 상상을, 이미지로",
  description: "모델과 프롬프트만 고르면, 나만의 이미지가 완성되는 크리에이티브 스튜디오.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
    >
      <body>{children}<Pwa/></body>
    </html>
  );
}
