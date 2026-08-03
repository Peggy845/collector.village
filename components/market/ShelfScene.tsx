'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

// 超市貨架的美化動畫骨架（2026-08-02 新增，補上跟工廠 MachineScene 對稱的視覺；
// 2026-08-03 換上 Peggy 用 Gemini 生成的貨架美術，取代 emoji 佔位，流程跟工廠那次換裝一樣）。
// 沿用工廠那套「建築本體不變＋疊加兩個小圖示」的模型：
//   - 貨架本體：Peggy 依 idea/gemini-超市美術prompt.md 生成，存在 public/market/shelf.png。
//   - A（右上角，有沒有庫存）：有貨＝ public/market/icon-bag.png；完全沒有庫存＝空蕩蕩，
//     沿用灰色蜘蛛網 emoji（沒有特別生一張圖，效果已經夠用）。
//   - B（右下角，只在為真時顯示，已滿）：直接沿用工廠那批已經生成的 icon-boxes.png，
//     語意上「一堆箱子」拿來表示「貨架被塞滿了」也說得通，不用另外生一張。
export default function ShelfScene({
  hasStock,
  isFull,
  justListed,
}: {
  /** 貨架上還有沒有庫存（排隊中或正在賣都算），決定右上角圖示 */
  hasStock: boolean;
  /** 貨架空位是不是已經塞滿了，決定右下角圖示要不要顯示 */
  isFull: boolean;
  /** 剛上架成功的短暫提示，純粹給玩家一個「有上架到」的反饋 */
  justListed?: boolean;
}) {
  return (
    <div className="relative flex h-28 items-center justify-center overflow-visible rounded-lg border border-teal-200 bg-teal-50">
      {/* 貨架本體 */}
      <div className="relative h-24 w-44">
        <Image src="/market/shelf.png" alt="" fill className="object-contain" sizes="176px" />
      </div>

      {/* A：有沒有庫存 */}
      <span
        className="absolute right-2 top-1 block h-7 w-7"
        aria-label={hasStock ? '貨架上有商品' : '貨架空蕩蕩'}
        title={hasStock ? '貨架上有商品' : '貨架空蕩蕩'}
      >
        {hasStock ? (
          <span className="relative block h-full w-full animate-pulse">
            <Image src="/market/icon-bag.png" alt="" fill className="object-contain" sizes="28px" />
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xl opacity-40">🕸️</span>
        )}
      </span>

      {/* B：空位已經塞滿了，只在為真時顯示 */}
      {isFull && (
        <span
          className="absolute bottom-1 right-2 block h-7 w-7"
          aria-label="貨架已經滿了"
          title="貨架已經滿了"
        >
          <Image src="/factory/icon-boxes.png" alt="" fill className="object-contain" sizes="28px" />
        </span>
      )}

      {justListed && <ListedFlourish />}
    </div>
  );
}

// 上架成功的瞬間短暫顯示，之後自己淡出——用 key 讓每次上架都重新掛載，
// 才能每次都從「不透明」重新開始淡出，不會因為前一次已經淡完而卡住（比照 MachineScene 的收成反饋）。
function ListedFlourish() {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFaded(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl transition-opacity duration-[1200ms] ${
        faded ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden
    >
      ✅
    </span>
  );
}
