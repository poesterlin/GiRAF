const storageKey = 'giraf:lut-favourites';

class LutFavourites {
	paths = $state<string[]>([]);
	private loaded = false;

	load() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
			if (Array.isArray(saved)) this.paths = [...new Set(saved.filter((path): path is string => typeof path === 'string'))];
		} catch {
			// Keep favourites available in memory when browser storage is unavailable.
		}
	}

	toggle(path: string) {
		this.load();
		this.paths = this.paths.includes(path) ? this.paths.filter((value) => value !== path) : [...this.paths, path];
		try {
			localStorage.setItem(storageKey, JSON.stringify(this.paths));
		} catch {
			// Keep the in-memory selection when storage is unavailable.
		}
	}
}

export const lutFavourites = new LutFavourites();
