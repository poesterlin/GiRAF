export async function resolveImportExposure(tiff: string, signal?: AbortSignal, timeoutMs = 60_000): Promise<number[]> {
	signal?.throwIfAborted();
	const child = Bun.spawn([process.execPath, 'scripts/resolve-auto-exposure.ts', tiff], { stdout: 'pipe', stderr: 'pipe', signal });
	let timedOut = false;
	const deadline = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, timeoutMs);
	let stdout: string, stderr: string, status: number;
	try {
		[stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	} finally {
		clearTimeout(deadline);
	}
	signal?.throwIfAborted();
	if (timedOut) throw new Error(`Auto-exposure analysis exceeded its ${timeoutMs / 1000} second deadline`);
	if (status !== 0) throw new Error(`Auto-exposure analysis failed: ${stderr}`);
	const values: unknown = JSON.parse(stdout.trim());
	if (!Array.isArray(values) || values.length !== 6 || !values.every((value) => typeof value === 'number' && Number.isFinite(value)))
		throw new Error('Invalid auto-exposure analysis');
	return values;
}
