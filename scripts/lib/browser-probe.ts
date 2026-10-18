import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// Shared scaffolding for scripts/*.browser.integration.ts. Each probe writes a throwaway
// Vite project that mounts real components from src/, stubs the `$lib` state and `$app`
// modules it needs, and drives the result with Playwright.

export const repoRoot = resolve(import.meta.dir, '../..');

export type ProbeBrowser = Awaited<ReturnType<typeof chromium.launch>>;

type ProbeAlias = { find: string | RegExp; replacement: string };

// Creates the project directory with index.html and main.ts, which mounts ./App.svelte.
// Probes that render Tailwind styles set `tailwind`, which also writes fixture.css.
// The caller writes App.svelte and any stubs itself.
export async function createProbeProject({ prefix, tailwind }: { prefix: string; tailwind: boolean }): Promise<string> {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	await symlink(join(repoRoot, 'node_modules'), join(temporary, 'node_modules'));
	await writeFile(join(temporary, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>');
	if (tailwind) {
		await writeFile(join(temporary, 'fixture.css'), `@import '${repoRoot}/src/app.css'; @source '${repoRoot}/src';`);
	}
	await writeFile(
		join(temporary, 'main.ts'),
		`${tailwind ? "import './fixture.css'; " : ''}import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.querySelector('#app') });`
	);
	return temporary;
}

// The `aliases` are checked before the `$lib` alias, which is always added last.
export async function createProbeServer(
	temporary: string,
	{ tailwind, aliases, noDiscovery = false }: { tailwind: boolean; aliases: ProbeAlias[]; noDiscovery?: boolean }
): Promise<ViteDevServer> {
	return createServer({
		root: temporary,
		configFile: false,
		plugins: [...(tailwind ? [tailwindcss()] : []), svelte({ configFile: false })],
		...(noDiscovery ? { optimizeDeps: { noDiscovery: true } } : {}),
		resolve: {
			alias: [...aliases, { find: '$lib', replacement: join(repoRoot, 'src/lib') }]
		},
		server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot, temporary] } }
	});
}

// Starts the dev server on a free port and returns that port.
export async function listenOnPort(server: ViteDevServer): Promise<number> {
	await server.listen();
	return (server.httpServer!.address() as { port: number }).port;
}

export async function launchProbeBrowser(): Promise<ProbeBrowser> {
	return chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
}

// Collects uncaught page errors into the returned array. `log` also prints each one.
export function collectPageErrors(page: Page, { log = false }: { log?: boolean } = {}): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => {
		errors.push(error.message);
		if (log) console.error(error.message);
	});
	return errors;
}

export async function closeProbe({ browser, server, temporary }: { browser?: ProbeBrowser; server: ViteDevServer; temporary: string }): Promise<void> {
	await browser?.close();
	await server.close();
	await rm(temporary, { recursive: true, force: true });
}
