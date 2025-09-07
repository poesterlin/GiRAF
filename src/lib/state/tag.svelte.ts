class TagStore {
	public selected = $state<string[]>([]);
	public existingTags = $state<string[]>([]);
	public tagInput = $state<string>('');
	public activeSuggestionIndex = $state(-1);
	public trimmedTagInput = $derived.by(() => this.tagInput.trim());

	public filteredTags = $derived.by(() => {
		if (!this.trimmedTagInput) {
			return [];
		}

		return this.existingTags.filter(
			(tag) =>
				tag.toLowerCase().includes(this.trimmedTagInput.toLowerCase()) && !this.selected.includes(tag)
		);
	});
	public showSuggestions = $derived(this.filteredTags.length > 0 && this.trimmedTagInput !== '');


	public handleTagInputKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
			case ' ':
			case ',':
				event.preventDefault();
				if (this.showSuggestions && this.activeSuggestionIndex > -1) {
					this.addTag(this.filteredTags[this.activeSuggestionIndex]);
				} else if (this.trimmedTagInput) {
					this.addTag(this.trimmedTagInput);
				}
				break;
			case 'Backspace':
				if (this.tagInput === '' && this.selected.length > 0) {
					// Remove last tag on backspace if input is empty
					this.removeTag(this.selected[this.selected.length - 1]);
				}
				break;
			case 'ArrowDown':
				event.preventDefault(); // Prevent cursor move
				if (this.showSuggestions) {
					this.activeSuggestionIndex = Math.min(
						this.activeSuggestionIndex + 1,
						this.filteredTags.length - 1
					);
				}
				break;
			case 'ArrowUp':
				event.preventDefault(); // Prevent cursor move
				if (this.showSuggestions) {
					this.activeSuggestionIndex = Math.max(this.activeSuggestionIndex - 1, 0);
				}
				break;
			case 'Escape':
				this.tagInput = '';
				break;
		}
	}

	public removeTag(tagToRemove: string) {
		this.selected = this.selected.filter((tag) => tag !== tagToRemove);
	}

	public addTag(tag: string) {
		if (tag && !this.selected.includes(tag)) {
			this.selected.push(tag);
		}
		this.tagInput = ''; // Clear input after adding
	}

	public handleTagInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		this.tagInput = input.value;

		// Reset active suggestion index when typing
		this.activeSuggestionIndex = -1;

		// If the input is empty, hide suggestions
		if (this.tagInput.trim() === '') {
			this.activeSuggestionIndex = -1;
		}
	}
}

export const tagStore = new TagStore();
