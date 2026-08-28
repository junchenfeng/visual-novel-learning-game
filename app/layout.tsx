import type { Metadata } from "next";
import { Ma_Shan_Zheng, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const serif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "700"],
});

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

const handwriting = Ma_Shan_Zheng({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-poem-original",
});

export const metadata: Metadata = {
  title: "诗词对话 RPG",
  description: "以古籍线稿和立绘对话学习文史常识的 DLC 教学游戏骨架",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${serif.className} ${sans.variable} ${handwriting.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
