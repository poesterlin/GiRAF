<script lang="ts">
	import thirdPartyLicenses from '$lib/assets/THIRD_PARTY_LICENSES.txt?raw';

	const { data } = $props();
	const rawtherapeeVersion = data?.rawtherapeeVersion?.trim();
	const rawtherapeeSourceUrl = data?.rawtherapeeSourceUrl?.trim();
	const hasSourceUrl = Boolean(rawtherapeeSourceUrl);
	const appLicenseText = data?.appLicenseText?.trim();
	const hasAppLicense = Boolean(appLicenseText);
</script>

<section class="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 p-6 text-neutral-200 overflow-auto">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold text-neutral-100">Legal</h1>
		<p class="text-sm text-neutral-400">
			This software uses RawTherapee (GPLv3) to process images.
		</p>
	</header>

	<div class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
		<h2 class="text-base font-semibold text-neutral-100">Open-source notices</h2>
		<ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
			<li>
				RawTherapee project page:
				<a
					class="text-neutral-100 underline decoration-neutral-600 underline-offset-4 hover:text-white"
					href="https://github.com/RawTherapee/RawTherapee"
					target="_blank"
					rel="noreferrer"
				>
					https://github.com/RawTherapee/RawTherapee
				</a>
			</li>
			<li>
				RawTherapee source code (exact version used by this deployment):
				{#if hasSourceUrl}
					<a
						class="text-neutral-100 underline decoration-neutral-600 underline-offset-4 hover:text-white"
						href={rawtherapeeSourceUrl}
						target="_blank"
						rel="noreferrer"
					>
						{rawtherapeeSourceUrl}
					</a>
					{#if rawtherapeeVersion}
						<span class="text-neutral-400">({rawtherapeeVersion})</span>
					{/if}
				{:else}
					<span class="text-amber-300">Not available in this deployment.</span>
				{/if}
			</li>
			<li>Third-party library licenses are listed below.</li>
		</ul>
	</div>

	<div class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
		<h2 class="text-base font-semibold text-neutral-100">Third-party licenses</h2>
		<pre class="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap text-xs text-neutral-300">
{thirdPartyLicenses}
		</pre>
	</div>

	{#if hasAppLicense}
		<div class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
			<h2 class="text-base font-semibold text-neutral-100">Application license</h2>
			<pre class="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap text-xs text-neutral-300">
{appLicenseText}
			</pre>
		</div>
	{/if}
</section>
