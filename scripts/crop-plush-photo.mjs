// 一次性小工具：把Peggy拍的實體娃娃照片（粉色布料背景，非AI生成的棋盤格假透明，跟
// fix-transparent-png.mjs處理的問題不同）去背成透明PNG，供3D房間布置的多面貼圖實驗用。
// 做法：從四個邊角取樣背景色（布料有皺褶陰影，不是純色，用corner取樣而不是單一像素），
// 從邊界flood fill、顏色距離在容許範圍內的視為背景清成透明，裁掉多餘留白後縮放。
//
// 用法：node scripts/crop-plush-photo.mjs <input.jpg> <output.png> [maxDim=600] [tolerance=45]
import sharp from 'sharp';

const [, , inputPath, outputPath, maxDimArg, toleranceArg] = process.argv;
if (!inputPath || !outputPath) {
  console.error('用法：node scripts/crop-plush-photo.mjs <input.jpg> <output.png> [maxDim=600] [tolerance=45]');
  process.exit(1);
}
const maxDim = Number(maxDimArg) || 600;
const TOLERANCE = Number(toleranceArg) || 45;

function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

async function main() {
  const img = sharp(inputPath).rotate(); // 依EXIF方向自動轉正
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // 從四個角落各取一小塊平均色當背景色樣本（布料有皺褶，單一像素容易取到陰影邊緣）。
  function sampleCorner(cx, cy) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy; y < cy + 20; y++) {
      for (let x = cx; x < cx + 20; x++) {
        const idx = (y * width + x) * 4;
        r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  }
  const corners = [sampleCorner(5, 5), sampleCorner(width - 25, 5), sampleCorner(5, height - 25), sampleCorner(width - 25, height - 25)];

  const isBackground = (x, y) => {
    const idx = (y * width + x) * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    return corners.some(([cr, cg, cb]) => colorDist(r, g, b, cr, cg, cb) < TOLERANCE);
  };

  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y++) stack.push([0, y], [width - 1, y]);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const pos = y * width + x;
    if (visited[pos]) continue;
    if (!isBackground(x, y)) continue;
    visited[pos] = 1;
    const idx = pos * 4;
    data[idx + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const declippedBuf = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const trimmedBuf = await sharp(declippedBuf).trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(trimmedBuf).metadata();
  const scale = Math.min(1, maxDim / Math.max(meta.width, meta.height));
  await sharp(trimmedBuf)
    .resize(Math.round(meta.width * scale), Math.round(meta.height * scale))
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`${inputPath} -> ${outputPath}：${Math.round(meta.width * scale)}x${Math.round(meta.height * scale)}`);
}

main().catch((err) => {
  console.error('失敗：', err.message);
  process.exitCode = 1;
});
