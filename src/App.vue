<template>
	<header>
		<div class="title">Gemini Watermark Remover</div>
		<div class="controls">
			<label>浮水印類型
				<select v-model="watermarkType">
					<option value="new">新版（screen）</option>
					<option value="old">舊版（alpha blend）</option>
					<option value="custom">自訂</option>
				</select>
			</label>
			<template v-if="watermarkType === 'custom'">
				<label>演算法
					<select v-model="customMode">
						<option value="subtract">subtract (orig + i)</option>
						<option value="screen">screen blend</option>
						<option value="lighten">lighten (max)</option>
						<option value="addscale">add × scale</option>
						<option value="blend">alpha blend → 255</option>
					</select>
				</label>
				<label v-if="customMode === 'addscale'">scale
					<input v-model.number="customAddScale" type="number" step="0.1" min="0.1" max="5">
				</label>
				<label>Logo
					<select v-model.number="customLogoSize">
						<option :value="96">96</option>
						<option :value="48">48</option>
					</select>
				</label>
				<label>Right
					<input v-model.number="customMarginRight" type="number" step="1">
				</label>
				<label>Bottom
					<input v-model.number="customMarginBottom" type="number" step="1">
				</label>
			</template>
			<button class="secondary" :disabled="!sourceImage" @click="reset">重新選擇</button>
			<template v-if="supportsFsa">
				<button
					class="save-btn"
					:class="{ saved: justSaved }"
					:disabled="!sourceImage || !sourceHandle"
					:title="sourceHandle ? '直接覆寫原始檔案' : '來源沒有對應的檔案，無法直接覆寫'"
					@click="save"
				>
					<span v-if="justSaved" class="check">✔</span>
					<template v-else>存檔</template>
				</button>
				<button :disabled="!sourceImage" @click="saveAs">另存新檔</button>
			</template>
			<button v-else :disabled="!sourceImage" @click="saveAs">儲存 PNG</button>
		</div>
	</header>
	<main>
		<DropZone v-if="!sourceImage" @select="loadFile" />
		<div v-else class="preview">
			<canvas ref="preview"></canvas>
		</div>
		<div class="info" :class="{ error: isError }">{{ info }}</div>
	</main>
</template>

<script setup lang="ts">
	import { computed, onMounted, ref, shallowRef, useTemplateRef, watchEffect } from "vue";
	import DropZone from "./DropZone.vue";
	import { extractDroppedFile } from "./file-drop";
	import { loadImage, removeWatermark, type RemovalMode, type RemovalOptions } from "./remover";

	type WatermarkType = "new" | "old" | "custom";

	const watermarkType = ref<WatermarkType>("new");

	// 自訂模式的參數（預設值與新版相同）
	const customMode = ref<RemovalMode>("screen");
	const customLogoSize = ref(96);
	const customMarginRight = ref(192);
	const customMarginBottom = ref(192);
	const customAddScale = ref(1);

	const supportsFsa = "showSaveFilePicker" in window;

	const sourceImage = shallowRef<HTMLImageElement | null>(null);
	const sourceHandle = shallowRef<FileSystemFileHandle | null>(null);
	const info = ref("");
	const isError = ref(false);
	const justSaved = ref(false);

	const previewCanvas = useTemplateRef("preview");

	let sourceFileName = "";
	let sourceType = "";
	let lastProcessed: HTMLCanvasElement | null = null;
	let savedTimer = 0;

	const options = computed<RemovalOptions | null>(() => {
		const img = sourceImage.value;
		if (!img) return null;
		// 「大圖」的判定：寬和高皆大於 1024（舊版實測如此；新版的標準未知，先假定相同）
		const large = img.naturalWidth > 1024 && img.naturalHeight > 1024;
		switch (watermarkType.value) {
			case "new": {
				// 大圖 → 96 logo / offset 192；小圖 → 48 logo / offset 96
				const logoSize = large ? 96 : 48;
				const offset = large ? 192 : 96;
				return { mode: "screen", logoSize, marginRight: offset, marginBottom: offset, addScale: 1 };
			}
			case "old": {
				// 大圖 → 96 logo / offset 64；小圖 → 48 logo / offset 32
				const logoSize = large ? 96 : 48;
				const offset = large ? 64 : 32;
				return { mode: "blend", logoSize, marginRight: offset, marginBottom: offset, addScale: 1 };
			}
			case "custom":
				return {
					mode: customMode.value,
					logoSize: customLogoSize.value,
					marginRight: customMarginRight.value || 0,
					marginBottom: customMarginBottom.value || 0,
					addScale: customAddScale.value || 1,
				};
		}
	});

	watchEffect(async () => {
		const img = sourceImage.value;
		const opts = options.value;
		const canvas = previewCanvas.value;
		if (!img || !opts || !canvas) return;
		const c = await removeWatermark(img, opts);
		canvas.width = c.width;
		canvas.height = c.height;
		canvas.getContext("2d")!.drawImage(c, 0, 0);
		lastProcessed = c;
		info.value = `尺寸：${c.width}×${c.height} ｜ mode=${opts.mode}, logo=${opts.logoSize}, 右=${opts.marginRight}, 下=${opts.marginBottom}`
			+ (opts.mode === "addscale" ? `, scale=${opts.addScale}` : "");
		isError.value = false;
	});

	async function loadFile(file: File, handle: FileSystemFileHandle | null = null): Promise<void> {
		if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
			info.value = "不支援的檔案類型：" + (file.type || file.name);
			isError.value = true;
			return;
		}
		sourceFileName = file.name;
		sourceType = file.type;
		sourceHandle.value = handle;
		justSaved.value = false;
		const url = URL.createObjectURL(file);
		try {
			sourceImage.value = await loadImage(url);
		} catch {
			info.value = "圖片解析失敗";
			isError.value = true;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	function reset(): void {
		sourceImage.value = null;
		sourceHandle.value = null;
		lastProcessed = null;
		info.value = "";
		isError.value = false;
		justSaved.value = false;
	}

	function processedToBlob(type: string): Promise<Blob | null> {
		const c = lastProcessed;
		if (!c) return Promise.resolve(null);
		return new Promise(resolve => c.toBlob(resolve, type));
	}

	// 存檔：直接覆寫來源檔案（保留原檔名與格式），成功後以打勾動畫提示
	async function save(): Promise<void> {
		const handle = sourceHandle.value;
		if (!handle) return;
		const blob = await processedToBlob(sourceType || "image/png");
		if (!blob) return;
		try {
			if (await handle.requestPermission({ mode: "readwrite" }) !== "granted") return;
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
		} catch {
			info.value = "存檔失敗";
			isError.value = true;
			return;
		}
		justSaved.value = true;
		clearTimeout(savedTimer);
		savedTimer = window.setTimeout(() => { justSaved.value = false; }, 1500);
	}

	// 另存新檔：加上 _nowm 後綴，跳存檔對話方塊；不支援 FSA 的瀏覽器退回 <a download>
	async function saveAs(): Promise<void> {
		const blob = await processedToBlob("image/png");
		if (!blob) return;
		const name = sourceFileName.replace(/\.[^.]+$/, "") + "_nowm.png";
		if (supportsFsa) {
			let handle: FileSystemFileHandle;
			try {
				handle = await window.showSaveFilePicker({
					suggestedName: name,
					types: [{ description: "PNG 圖片", accept: { "image/png": [".png"] } }],
				});
			} catch {
				return; // 使用者取消
			}
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
		} else {
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		}
	}

	onMounted(() => {
		// 全域防止瀏覽器在 drop 時開啟檔案（這會奪走焦點、讓 dropzone 收不到 drop）。
		// 並把 drop 也綁全域、整頁任何位置 drop 都接：
		window.addEventListener("dragover", e => { e.preventDefault(); });
		window.addEventListener("drop", e => {
			e.preventDefault();
			const dropped = extractDroppedFile(e.dataTransfer);
			if (!dropped) return;
			void dropped.handle.then(h => loadFile(dropped.file, h));
		});
	});
</script>
