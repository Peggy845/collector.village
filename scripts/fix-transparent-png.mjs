// 有些 Gemini 生圖流程輸出的「透明背景」其實不是真的 alpha 透明，是把預覽用的灰白棋盤格直接畫成
// 不透明像素（用 sharp 讀 metadata 會顯示 hasAlpha:true，但角落實際 RGBA 是 (215,215,215,255) 這種
// 不透明灰色，不是 (0,0,0,0)）。這支腳本做三件事：
//   1. 從四個邊界 flood fill，把跟邊界相連、顏色接近灰階（棋盤格特徵）的區域清成真透明——黑色描邊/
//      彩色內容因為不是「淺色灰階」，flood fill 碰到會自然停下，不會誤傷物件本體或物件內部的白色細節
//      （例如收銀機的白色抽屜、洞洞板的白色圓孔，這些是獨立區塊、沒有跟邊界直接相連，不會被清除）。
//   2. 裁掉四周多餘的透明留白（sharp .trim()）。
//   3. 縮小到指定最大邊長（預設480px，跟 public/factory/ 既有圖檔量級一致，2048px原圖對遊戲裡的小
//      圖示來說太大，檔案也動輒2~5MB）。
//
// 用法：node scripts/fix-transparent-png.mjs <input.png> <output.png> [maxDim=480]
//
// 判斷「這張圖是不是中了這個問題」的方法：node scripts/dev-verify-alpha 這類檢查角落alpha，或者
// 直接看檔案大小——真的透明背景的PNG通常遠小於2MB，因為大片透明區塊壓縮率很高；如果一張聲稱透明背景
// 的圖動輒3~5MB，很可能就是背景其實被畫成不透明的棋盤格圖案，值得跑一次這支腳本檢查。
import sharp from 'sharp';

const [, , inputPath, outputPath, maxDimArg] = process.argv;
if (!inputPath || !outputPath) {
  console.error('用法：node scripts/fix-transparent-png.mjs <input.png> <output.png> [maxDim=480]');
  process.exit(1);
}
const maxDim = Number(maxDimArg) || 480;

const GRAY_TOLERANCE = 12; // R/G/B 彼此差距在這之內視為灰階
const MIN_BRIGHTNESS = 140; // 低於這個亮度不當作棋盤格背景（避開黑色描邊）

async function declipCheckerboard(inputPath) {
  const img = sharp(inputPath);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const isCheckerLike = (x, y) => {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min <= GRAY_TOLERANCE && max >= MIN_BRIGHTNESS;
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
    if (!isCheckerLike(x, y)) continue;
    visited[pos] = 1;
    const idx = pos * 4;
    data[idx + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function main() {
  const declippedBuf = await declipCheckerboard(inputPath);
  const trimmedBuf = await sharp(declippedBuf).trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(trimmedBuf).metadata();
  const scale = Math.min(1, maxDim / Math.max(meta.width, meta.height));
  await sharp(trimmedBuf)
    .resize(Math.round(meta.width * scale), Math.round(meta.height * scale))
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(
    `${inputPath} -> ${outputPath}：去棋盤格+裁切+縮放，最終 ${Math.round(meta.width * scale)}x${Math.round(meta.height * scale)}`
  );
}

main().catch((err) => {
  console.error('失敗：', err.message);
  process.exitCode = 1;
});
