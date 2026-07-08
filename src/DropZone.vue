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

	const emit = defineEmits<{ select: [file: File] }>();

	const hover = ref(false);
	const fileInput = useTemplateRef("file");

	function pickFile(): void {
		fileInput.value?.click();
	}

	function onFilePicked(): void {
		const inp = fileInput.value;
		const f = inp?.files?.[0];
		if (f) emit("select", f);
		// 清空 value，讓下次重選同一個檔案也會觸發 change
		if (inp) inp.value = "";
	}

	function onDrop(e: DragEvent): void {
		hover.value = false;
		const f = e.dataTransfer?.files?.[0];
		if (f) emit("select", f);
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
