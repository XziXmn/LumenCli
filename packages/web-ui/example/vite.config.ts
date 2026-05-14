import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	resolve: {
		alias: {
			// Stub out Node.js modules that pi-tui/pi-ai import but aren't needed in browser
			"node:child_process": "data:text/javascript,export const spawn = () => { throw new Error('Not available in browser') }; export const execSync = spawn; export const spawnSync = spawn; export default { spawn, execSync, spawnSync };",
			"child_process": "data:text/javascript,export const spawn = () => { throw new Error('Not available in browser') }; export const execSync = spawn; export const spawnSync = spawn; export default { spawn, execSync, spawnSync };",
			"node:fs": "data:text/javascript,export const readFileSync = () => ''; export const existsSync = () => false; export const writeFileSync = () => {}; export const readdirSync = () => []; export const statSync = () => ({}); export const mkdirSync = () => {}; export default { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync };",
			"node:os": "data:text/javascript,export const homedir = () => '/'; export const platform = () => 'browser'; export const tmpdir = () => '/tmp'; export default { homedir, platform, tmpdir };",
			"node:path": "data:text/javascript,export const join = (...args) => args.join('/'); export const resolve = (...args) => args.join('/'); export const dirname = (p) => p.split('/').slice(0,-1).join('/'); export const basename = (p) => p.split('/').pop(); export const extname = (p) => { const m = p.match(/\\.[^.]+$/); return m ? m[0] : ''; }; export const relative = (a,b) => b; export const sep = '/'; export default { join, resolve, dirname, basename, extname, relative, sep };",
			"node:crypto": "data:text/javascript,export const createHash = () => ({ update: () => ({ digest: () => 'mock' })}); export const randomUUID = () => crypto.randomUUID(); export default { createHash, randomUUID };",
		},
	},
	optimizeDeps: {
		exclude: ["@earendil-works/pi-tui"],
	},
});
