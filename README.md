# Gemini Watermark Remover

移除 Gemini 生成圖片右下角浮水印的純前端小工具。所有處理皆在瀏覽器內完成，圖片不會上傳到任何伺服器。

## 演算法

- **新版（subtract / screen / lighten / addscale）**：共用一份從純黑底測試圖萃取的 96×96 intensity map（[src/watermark-data.ts](src/watermark-data.ts)），依各自的混合公式反推原始像素。
- **舊版（alpha blend）**：沿用 [journey-ad/gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 的反向 alpha blend：`original = (watermarked - α·255) / (1 - α)`。

## 開發

```sh
pnpm install
pnpm dev        # 開發伺服器（http://localhost:3000/watermark-remover/）
pnpm build      # 產生 dist/
pnpm typecheck  # TypeScript 型別檢查
```

## 部署

推送到 `main` 分支後，GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）會自動建置並部署到 GitHub Pages。

注意：部署路徑取決於 repo 名稱，若 repo 不叫 `watermark-remover`，需同步修改 [rsbuild.config.ts](rsbuild.config.ts) 的 `server.base`。

## 專案結構

- [src/index.html](src/index.html) — HTML 模板（僅掛載點）
- [src/styles.css](src/styles.css) — 全域樣式
- [src/index.ts](src/index.ts) — 進入點（掛載 Vue app）
- [src/App.vue](src/App.vue) — 主元件（浮水印類型切換、預覽、儲存）
- [src/DropZone.vue](src/DropZone.vue) — 拖放／點選載入圖片的元件
- [src/remover.ts](src/remover.ts) — 浮水印移除演算法
- [src/watermark-data.ts](src/watermark-data.ts) — 浮水印素材資料（base64）

## 浮水印類型

- **新版**（預設）：screen blend、96 logo、offset 192。
- **舊版**：alpha blend，依圖片尺寸自動選擇參數——寬高皆大於 1024 用 96 logo / offset 64，否則 48 / 32。
- **自訂**：手動指定演算法與所有參數。
