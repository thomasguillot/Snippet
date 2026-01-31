import fs from "node:fs";
import path from "path";
import { createRequire } from "node:module";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Connect } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Dev-only: serve /api/video-info?url=... using yt-dlp so browser localhost can fetch video info without Electron. */
function videoInfoApiPlugin(): { name: string; configureServer(server: { middlewares: Connect.Server }): void } {
	return {
		name: "video-info-api",
		configureServer(server) {
			server.middlewares.use("/api/video-info", async (req, res, next) => {
				if (req.method !== "GET" || !req.url) {
					next();
					return;
				}
				const parsed = new URL(req.url, "http://localhost");
				const rawUrl = parsed.searchParams.get("url");
				if (!rawUrl || !rawUrl.trim()) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify({ error: "URL is required" }));
					return;
				}
				const url = decodeURIComponent(rawUrl.trim());
				try {
					const parsedUrl = new URL(url);
					if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ error: "Only HTTP and HTTPS URLs are allowed" }));
						return;
					}
					const host = parsedUrl.hostname.toLowerCase();
					if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(host)) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ error: "Localhost URLs are not allowed" }));
						return;
					}
					// Block private IP ranges (SSRF mitigation, same as main process)
					if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./i.test(host)) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ error: "Private network URLs are not allowed" }));
						return;
					}
				} catch {
					res.statusCode = 400;
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify({ error: "Invalid URL" }));
					return;
				}
				const binPath = path.join(__dirname, "bin", "yt-dlp");
				if (!fs.existsSync(binPath)) {
					res.statusCode = 503;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: "yt-dlp not found. Run npm run download-yt-dlp or use the Electron app.",
						})
					);
					return;
				}
				try {
					const YTDlpWrap = require("yt-dlp-wrap").default;
					const wrap = new YTDlpWrap(binPath);
					const info = await wrap.getVideoInfo(url);
					res.statusCode = 200;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							duration: info?.duration ?? null,
							title: info?.title ?? null,
						})
					);
				} catch (err) {
					console.error("video-info-api error:", err);
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: err instanceof Error ? err.message : "Failed to fetch video info",
						})
					);
				}
			});
		},
	};
}

export default defineConfig({
	base: "./",
	build: {
		emptyOutDir: true,
		outDir: "dist",
	},
	plugins: [react(), videoInfoApiPlugin()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
