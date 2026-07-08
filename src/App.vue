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
			<button :disabled="!sourceImage" @click="save">儲存 PNG</button>
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
	import { loadImage, removeWatermark, type RemovalMode, type RemovalOptions } from "./remover";

	type WatermarkType = "new" | "old" | "custom";

	const watermarkType = ref<WatermarkType>("new");

	// 自訂模式的參數（預設值與新版相同）
	const customMode = ref<RemovalMode>("screen");
	const customLogoSize = ref(96);
	const customMarginRight = ref(192);
	const customMarginBottom = ref(192);
	const customAddScale = ref(1);

	const sourceImage = shallowRef<HTMLImageElement | null>(null);
	const info = ref("");
	const isError = ref(false);

	const previewCanvas = useTemplateRef("preview");

	let sourceFileName = "";
	let lastProcessed: HTMLCanvasElement | null = null;

	const options = computed<RemovalOptions | null>(() => {
		const img = sourceImage.value;
		if (!img) return null;
		switch (watermarkType.value) {
			case "new":
				return { mode: "screen", logoSize: 96, marginRight: 192, marginBottom: 192, addScale: 1 };
			case "old": {
				// 寬高皆大於 1024 → 96 logo / offset 64；否則 48 / 32
				const large = img.naturalWidth > 1024 && img.naturalHeight > 1024;
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

	async function loadFile(file: File): Promise<void> {
		if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
			info.value = "不支援的檔案類型：" + (file.type || file.name);
			isError.value = true;
			return;
		}
		sourceFileName = file.name;
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
		lastProcessed = null;
		info.value = "";
		isError.value = false;
	}

	async function save(): Promise<void> {
		if (!lastProcessed) return;
		const c = lastProcessed;
		const blob = await new Promise<Blob | null>(resolve => c.toBlob(resolve, "image/png"));
		if (!blob) return;
		const name = sourceFileName.replace(/\.[^.]+$/, "") + "_nowm.png";
		// 優先使用 File System Access API；不支援的瀏覽器退回 <a download>
		if ("showSaveFilePicker" in window) {
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
			const f = e.dataTransfer?.files?.[0];
			if (f) void loadFile(f);
		});
	});
</script>
