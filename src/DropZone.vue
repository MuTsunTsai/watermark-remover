<template>
	<div
		class="dropzone"
		:class="{ hover }"
		@click="pickFile"
		@dragover.prevent="hover = true"
		@dragleave.prevent="hover = false"
		@drop.prevent.stop="onDrop"
	>
		<div class="plus">＋</div>
		<div>拖曳圖片或點此選擇</div>
		<div class="hint">PNG / JPEG / WebP</div>
		<input ref="file" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onFilePicked">
	</div>
</template>

<script setup lang="ts">
	import { ref, useTemplateRef } from "vue";
	import { extractDroppedFile } from "./file-drop";

	const emit = defineEmits<{ select: [file: File, handle: FileSystemFileHandle | null] }>();

	const hover = ref(false);
	const fileInput = useTemplateRef("file");

	async function pickFile(): Promise<void> {
		// 優先使用 File System Access API；不支援的瀏覽器退回 hidden input
		if (!("showOpenFilePicker" in window)) {
			fileInput.value?.click();
			return;
		}
		let handle: FileSystemFileHandle;
		try {
			[handle] = await window.showOpenFilePicker({
				types: [{
					description: "圖片",
					accept: {
						"image/png": [".png"],
						"image/jpeg": [".jpg", ".jpeg"],
						"image/webp": [".webp"],
					},
				}],
			});
		} catch {
			return; // 使用者取消
		}
		emit("select", await handle.getFile(), handle);
	}

	function onFilePicked(): void {
		const inp = fileInput.value;
		const f = inp?.files?.[0];
		if (f) emit("select", f, null);
		// 清空 value，讓下次重選同一個檔案也會觸發 change
		if (inp) inp.value = "";
	}

	function onDrop(e: DragEvent): void {
		hover.value = false;
		const dropped = extractDroppedFile(e.dataTransfer);
		if (!dropped) return;
		void dropped.handle.then(h => emit("select", dropped.file, h));
	}
</script>

<style scoped>
	.dropzone {
		flex: 1;
		border: 2px dashed #555;
		border-radius: 0.5rem;
		background: #222;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 0.5rem;
		cursor: pointer;
		color: #888;
	}

	.dropzone.hover {
		border-color: #0d6efd;
		background: #1a2433;
		color: #ccc;
	}

	.plus {
		font-size: 2rem;
	}

	.hint {
		font-size: 0.8rem;
	}
</style>
