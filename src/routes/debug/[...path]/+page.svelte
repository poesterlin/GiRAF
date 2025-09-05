<script lang="ts">
	let { data }: any = $props();
</script>

<h1 class="text-2xl font-bold">Debug Page</h1>

<div class="flex gap-8">

    <div class="mb-4 flex flex-col gap-2">
        <h2 class="text-xl font-semibold mt-4">Contents of {data.path} directory:</h2>
        <a href="/debug{data.path}/..">..</a>
        {#each data.folders as folder}
        <a href="/debug{data.path}/{folder}" class="hover:underline">{folder}</a>
        {/each}
    </div>
    
    <div class="mb-4 flex flex-col gap-2">
        <h2 class="text-xl font-semibold mt-4">Files:</h2>
        {#each data.files as file}
        <a href="/api/download{data.path}/{file}" class="hover:underline">{file}</a>
        {/each}
    </div>
</div>