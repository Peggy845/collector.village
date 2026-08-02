import { GRID_SIZE, paletteColorFor } from './palette';

// 把像素陣列畫成一張放大版的透明背景PNG，純粹給 DesignThumb／工廠/超市/倉庫畫面顯示用
// （見 components/factory/DesignThumb.tsx：它只認一張圖片路徑，不會去讀像素陣列）。
// 「真正的資料」是像素陣列本身（存在 player_designs.pixel_data，供「匯入設計」讀回編輯），
// 這張圖只是渲染結果，不是編輯依據（2026-08-02，設計坊系統 v1）。
const RENDER_SCALE = 12;

export async function rasterizePixelGrid(pixelData: number[]): Promise<Blob> {
  const size = GRID_SIZE * RENDER_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const colorIndex = pixelData[row * GRID_SIZE + col];
      const color = paletteColorFor(colorIndex);
      if (color.hex === null) continue; // 透明格子不畫，維持畫布本身的透明背景
      ctx.fillStyle = color.hex;
      ctx.fillRect(col * RENDER_SCALE, row * RENDER_SCALE, RENDER_SCALE, RENDER_SCALE);
    }
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('圖片渲染失敗');
  return blob;
}
