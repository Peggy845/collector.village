import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ 臨時關閉，測試dev模式下StrictMode雙重掛載造成three.js WebGL context崩潰的問題，測完記得評估要不要留著
  reactStrictMode: false,
};

export default nextConfig;
