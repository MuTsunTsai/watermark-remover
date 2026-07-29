// 從「純黑底」的 Gemini 浮水印樣本圖萃取 intensity map，
// 並直接寫入 src/watermark-data.ts 的 WATERMARK_INTENSITY_<size> 常數。
//
// 原理：新版浮水印是 screen blend，在純黑底上 result = intensity，
// 所以直接讀取浮水印區域的像素值（取 RGB 最大值）就是 intensity map。
//
// 用法：node scripts/extract-intensity.mjs <樣本圖路徑> <logoSize> <offset>
// 例如：node scripts/extract-intensity.mjs sample.png 48 96

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "fast-png";

const [, , imagePath, logoSizeArg, offsetArg] = process.argv;
if (!imagePath || !logoSizeArg || !offsetArg) {
	console.error("用法：node scripts/extract-intensity.mjs <樣本圖路徑> <logoSize> <offset>");
	process.exit(1);
}
const logoSize = Number(logoSizeArg);
const offset = Number(offsetArg);

const png = decode(readFileSync(imagePath));
const { width, height, channels, data } = png;
console.log(`圖片：${width}×${height}，channels=${channels}`);

const x0 = width - offset - logoSize;
const y0 = height - offset - logoSize;
if (x0 < 0 || y0 < 0) {
	console.error("圖片太小，放不下指定的 logo/offset");
	process.exit(1);
}

// 檢查浮水印區域外圍一圈是否為近黑（確認樣本是純黑底、參數對位正確）
let borderMax = 0;
for (let i = -4; i < logoSize + 4; i++) {
	for (const [x, y] of [
		[x0 + i, y0 - 4], [x0 + i, y0 + logoSize + 3],
		[x0 - 4, y0 + i], [x0 + logoSize + 3, y0 + i],
	]) {
		if (x < 0 || y < 0 || x >= width || y >= height) continue;
		const o = (y * width + x) * channels;
		borderMax = Math.max(borderMax, data[o], data[o + 1], data[o + 2]);
	}
}
console.log(`區域外圍最大像素值：${borderMax}${borderMax > 8 ? "（警告：背景可能不是純黑，或參數不對）" : "（OK）"}`);

// 萃取 intensity map
const map = new Uint8Array(logoSize * logoSize);
let maxVal = 0;
let nonZero = 0;
for (let row = 0; row < logoSize; row++) {
	for (let col = 0; col < logoSize; col++) {
		const o = ((y0 + row) * width + (x0 + col)) * channels;
		const v = Math.max(data[o], data[o + 1], data[o + 2]);
		map[row * logoSize + col] = v;
		if (v > 0) nonZero++;
		if (v > maxVal) maxVal = v;
	}
}
console.log(`intensity map：${logoSize}×${logoSize}，max=${maxVal}，非零像素=${nonZero}`);

const base64 = Buffer.from(map).toString("base64");

// 寫入 src/watermark-data.ts（已存在同名常數則取代，否則附加到檔案結尾）
const dataFile = join(dirname(fileURLToPath(import.meta.url)), "../src/watermark-data.ts");
const constName = `WATERMARK_INTENSITY_${logoSize}`;
let src = readFileSync(dataFile, "utf8");
const decl = `export const ${constName} = "${base64}";`;
const pattern = new RegExp(`export const ${constName} = "[^"]*";`);
if (pattern.test(src)) {
	src = src.replace(pattern, decl);
	console.log(`已取代 ${constName}`);
} else {
	src = src.replace(/\s*$/, "\r\n\r\n" + decl + "\r\n");
	console.log(`已新增 ${constName}`);
}
writeFileSync(dataFile, src, "utf8");
console.log("完成：" + dataFile);
