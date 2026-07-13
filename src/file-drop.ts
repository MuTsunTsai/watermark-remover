// 從 drop 事件取出檔案與（如果瀏覽器支援）對應的 FileSystemFileHandle。
// 注意：getAsFileSystemHandle() 必須在事件處理期間「同步」呼叫，
// 一旦 await 過後 DataTransfer 的 items 就失效了，所以這裡先同步取得 Promise 再解析。

export interface DroppedFile {
	file: File;
	handle: Promise<FileSystemFileHandle | null>;
}

export function extractDroppedFile(dt: DataTransfer | null): DroppedFile | null {
	const file = dt?.files?.[0];
	if (!file) return null;
	const item = dt?.items?.[0];
	const promise = item && "getAsFileSystemHandle" in item ? item.getAsFileSystemHandle() : null;
	const handle = (async () => {
		try {
			const h = await promise;
			return h?.kind === "file" ? h as FileSystemFileHandle : null;
		} catch {
			return null;
		}
	})();
	return { file, handle };
}
