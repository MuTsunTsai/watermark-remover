// Gemini 浮水印移除演算法。
// 沿用 journey-ad/gemini-watermark-remover 的反向 blend：
//   original = (watermarked - alpha * 255) / (1 - alpha)
// 以及針對新版浮水印的 subtract / screen / lighten / addscale 反推公式。

import { WATERMARK_BG_48, WATERMARK_BG_96, WATERMARK_INTENSITY_48, WATERMARK_INTENSITY_96 } from "./watermark-data";

export type RemovalMode = "subtract" | "screen" | "lighten" | "addscale" | "blend";

export interface RemovalOptions {
	mode: RemovalMode;
	logoSize: number;
	marginRight: number;
	marginBottom: number;
	addScale: number;
}

// ─── 舊版（alpha blend）演算法 ──────────────────────────────
// mixed = obj × α + 255 × (1-α) → obj = (mixed - α·255) / (1-α)
const ALPHA_THRESHOLD = 2e-3;
const MAX_ALPHA = 0.99;
const LOGO_VALUE = 255;

const alphaMaps: Record<number, Float32Array> = {};

// ─── 新版（subtract / linear dodge）演算法 ──────────────────
// result = clamp(orig + intensity) → orig = max(0, result - intensity)
// intensity map 來自純黑底測試圖萃取（見 scripts/extract-intensity.mjs），
// 48 與 96 各有一份原生尺寸的 map；其它 logoSize 以最近點取樣縮放。
const INTENSITY_SOURCES: Record<number, string> = {
	48: WATERMARK_INTENSITY_48,
	96: WATERMARK_INTENSITY_96,
};

const intensityMaps: Record<number, Uint8Array> = {};

function getIntensityMap(size: number): { map: Uint8Array; mapSize: number } {
	const mapSize = size in INTENSITY_SOURCES ? size : 96;
	let map = intensityMaps[mapSize];
	if (!map) {
		const bin = atob(INTENSITY_SOURCES[mapSize]);
		map = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) map[i] = bin.charCodeAt(i);
		intensityMaps[mapSize] = map;
	}
	return { map, mapSize };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

async function getAlphaMap(size: number): Promise<Float32Array> {
	const cached = alphaMaps[size];
	if (cached) return cached;
	const img = await loadImage(size === 48 ? WATERMARK_BG_48 : WATERMARK_BG_96);
	const c = document.createElement("canvas");
	c.width = size;
	c.height = size;
	const cx = c.getContext("2d")!;
	cx.drawImage(img, 0, 0);
	const id = cx.getImageData(0, 0, size, size).data;
	const map = new Float32Array(size * size);
	for (let i = 0; i < map.length; i++) {
		const o = i * 4;
		map[i] = Math.max(id[o], id[o + 1], id[o + 2]) / 255;
	}
	alphaMaps[size] = map;
	return map;
}

export async function removeWatermark(sourceImg: HTMLImageElement, options: RemovalOptions): Promise<HTMLCanvasElement> {
	const { mode, logoSize, marginRight, marginBottom, addScale } = options;
	const c = document.createElement("canvas");
	c.width = sourceImg.naturalWidth;
	c.height = sourceImg.naturalHeight;
	const cx = c.getContext("2d")!;
	cx.drawImage(sourceImg, 0, 0);
	const imageData = cx.getImageData(0, 0, c.width, c.height);
	const data = imageData.data;

	const x0 = c.width - marginRight - logoSize;
	const y0 = c.height - marginBottom - logoSize;

	if (mode !== "blend") {
		// 新版（subtract / screen / lighten / addscale）：共用同一份 intensity map
		// 但反推公式不同。intensity map 來自純黑底測試萃取的 logo 灰度值。
		const { map, mapSize } = getIntensityMap(logoSize);
		for (let row = 0; row < logoSize; row++) {
			for (let col = 0; col < logoSize; col++) {
				const x = x0 + col;
				const y = y0 + row;
				if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
				const mr = Math.min(mapSize - 1, Math.floor(row * mapSize / logoSize));
				const mc = Math.min(mapSize - 1, Math.floor(col * mapSize / logoSize));
				const intensity = map[mr * mapSize + mc];
				if (intensity === 0) continue;
				const imgIdx = (y * c.width + x) * 4;
				for (let ch = 0; ch < 3; ch++) {
					const v = data[imgIdx + ch];
					let orig: number;
					if (mode === "subtract") {
						orig = v - intensity;
					} else if (mode === "screen") {
						// result = 255 - (255-orig)(255-intensity)/255
						// → orig = 255 - 255*(255-result) / (255-intensity)
						const denom = 255 - intensity;
						orig = denom <= 0 ? v : 255 - (255 * (255 - v)) / denom;
					} else if (mode === "lighten") {
						// result = max(orig, intensity)；無法完美反推
						// 啟發式：若 result 接近 intensity (±2) → 視為 logo 蓋的、給黑；否則保留
						orig = Math.abs(v - intensity) <= 2 ? 0 : v;
					} else {
						// addscale
						orig = v - intensity * addScale;
					}
					data[imgIdx + ch] = Math.max(0, Math.min(255, Math.round(orig)));
				}
			}
		}
	} else {
		// 舊版：alpha blend
		const map = await getAlphaMap(logoSize);
		for (let row = 0; row < logoSize; row++) {
			for (let col = 0; col < logoSize; col++) {
				const x = x0 + col;
				const y = y0 + row;
				if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
				const imgIdx = (y * c.width + x) * 4;
				let a = map[row * logoSize + col];
				if (a < ALPHA_THRESHOLD) continue;
				if (a > MAX_ALPHA) a = MAX_ALPHA;
				const oneMinus = 1 - a;
				for (let ch = 0; ch < 3; ch++) {
					const w = data[imgIdx + ch];
					const orig = (w - a * LOGO_VALUE) / oneMinus;
					data[imgIdx + ch] = Math.max(0, Math.min(255, Math.round(orig)));
				}
			}
		}
	}

	cx.putImageData(imageData, 0, 0);
	return c;
}
