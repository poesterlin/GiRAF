<script lang="ts">
	let { name }: { name: string } = $props();
	const paths: Record<string, string> = {
		'White Balance': 'M12 3v17M8 21h8M4 7h16M6 7l-3 7h6zM18 7l-3 7h6z',
		Light: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
		'Dynamic Range': 'M4 5v14m16-14v14M4 12h16M8 9l-3 3 3 3m8-6 3 3-3 3',
		'Tone Curve': 'M4 3v17h17M5 17c7 0 5-10 14-12',
		Color: 'M12 3C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-11M8 15c0 2 1 3 3 3',
		'Color Mixer': 'M8 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10M16 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
		'Color Grading': 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
		'Black & White': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 3v18M15 7h2m-2 4h5m-5 4h4',
		Clarity: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z',
		'Warm & colour': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 3v18M12 8h4m-4 4h6m-6 4h4',
		Dehaze: 'M4 7h16M6 12h12M4 17h16M9 12h6',
		'Noise Reduction': 'M4 7h2m3 0h2m3 0h2m3 0h1M4 12h2m3 0h2m3 0h2m3 0h1M4 17h2m3 0h2m3 0h2m3 0h1',
		Sharpening: 'M21 3l-5 12-7 2 2-7zM21 3 9 17M9 17l-3 4-3-3 4-3',
		Vignette: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
		Look: 'M4 4h16v16H4zM4 8h16M8 4v16M16 4v16',
		'Graduated Mask': 'M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18',
		'Radial Mask': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11v2m-1-1h2'
	};
</script>

<svg
	width="19"
	height="19"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class="mr-2.5 shrink-0 text-neutral-400"
	aria-hidden="true"><path d={paths[name] ?? 'M4 7h16M4 12h16M4 17h16'} /></svg
>
