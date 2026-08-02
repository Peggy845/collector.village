'use client';

import { useEffect, useState } from 'react';

// 超市貨架的美化動畫骨架（2026-08-02 新增，補上跟工廠 MachineScene 對稱的視覺）。
// 沿用工廠那套「建築本體不變＋疊加兩個小圖示」的模型，但目前還沒有 Gemini 生成的貨架美術，
// 所以先用 emoji 佔位（跟工廠當初 a055ed8 那版一樣的做法）。之後 Peggy 生出貨架/店面美術素材、
// 存進 public/market/ 後，只需要把下面的 emoji 換成 <Image src="...png">，不用動呼叫端（ShelfCard）
// 或這裡的狀態判斷邏輯——完全比照 idea/gemini-工廠美術prompt.md 那次的換裝流程。
//
// 兩個疊加圖示分別代表：
//   A（右上角）：貨架上有沒有還沒賣完的庫存（不論排隊中還是正在賣）＝有貨，完全沒有庫存＝空蕩蕩。
//   B（右下角，只在為真時顯示）：貨架空位是不是已經全部塞滿了＝已滿（暫時不用急著補貨）。
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
      {/* 建築本體佔位，之後直接換成 <Image src="Gemini生成的貨架圖" /> */}
      <span className="text-5xl opacity-70">🛒</span>

      {/* A：有沒有庫存 */}
      <span
        className="absolute right-3 top-1 text-xl"
        aria-label={hasStock ? '貨架上有商品' : '貨架空蕩蕩'}
        title={hasStock ? '貨架上有商品' : '貨架空蕩蕩'}
      >
        {hasStock ? <span className="animate-pulse">🛍️</span> : <span className="opacity-40">🕸️</span>}
      </span>

      {/* B：空位已經塞滿了，只在為真時顯示 */}
      {isFull && (
        <span className="absolute bottom-1 right-3 text-xl" aria-label="貨架已經滿了" title="貨架已經滿了">
          📦
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
