import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";

export default defineConfig({
	html: {
		template: "./src/index.html",
	},
	server: {
		// GitHub Pages 部署在 https://<user>.github.io/watermark-remover/ 之下，
		// 若 repo 名稱不同，要同步修改這裡。
		base: "/watermark-remover",
	},
	output: {
		polyfill: "off",
	},
	plugins: [pluginVue()],
});
