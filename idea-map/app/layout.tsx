import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IdeaMap — 思考整理ツール",
  description: "アイデアを投げ込むとAIが自動で意見マップを生成します",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
