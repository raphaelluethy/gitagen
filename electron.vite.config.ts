import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	main: {
		build: {
			externalizeDeps: {
				exclude: [
					"ai",
					"@ai-sdk/anthropic",
					"@ai-sdk/cerebras",
					"@ai-sdk/fireworks",
					"@ai-sdk/openai",
					"@ai-sdk/openai-compatible",
					"@ai-sdk/provider-utils",
					"@openrouter/ai-sdk-provider",
					"eventsource-parser",
					"simple-git",
					"drizzle-orm",
					"dedent",
					"ms",
				],
			},
			rollupOptions: {
				external: ["keytar", "@libsql/client"],
			},
		},
	},
	preload: {},
	renderer: {
		root: "src/renderer",
		plugins: [
			react({
				babel: {
					plugins: ["babel-plugin-react-compiler"],
				},
			}),
			tailwindcss(),
		],
	},
});
