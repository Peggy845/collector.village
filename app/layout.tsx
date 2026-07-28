import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://collector-village-nine.vercel.app"),
  title: "Collector.Village",
  description:
    "動漫周邊收藏管理工具，勾選你擁有的商品、追蹤收藏紀錄，先以《進擊的巨人》為主軸，未來持續擴充其他 IP。",
  openGraph: {
    title: "Collector.Village",
    description: "動漫周邊收藏管理工具，勾選你擁有的商品、追蹤收藏紀錄。",
    url: "/",
    siteName: "Collector.Village",
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Collector.Village",
    description: "動漫周邊收藏管理工具，勾選你擁有的商品、追蹤收藏紀錄。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
