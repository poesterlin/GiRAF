

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

class AppState {
    toasts = $state<Toast[]>([]);

    addToast(message: string, type: 'success' | 'error' | 'info') {
        const toast = { id: crypto.randomUUID(), message, type };
        this.toasts.push(toast);

        setTimeout(() => {
            this.toasts.shift();
        }, 3000);
    }
}

export const app = new AppState();
