import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
	id: number;
	message: string;
}

interface ToastContextValue {
	toast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const idRef = useRef(0);

	const toast = useCallback((message: string) => {
		const id = ++idRef.current;
		setToasts((prev) => [...prev, { id, message }]);
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, TOAST_DURATION_MS);
	}, []);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			<div
				className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
				aria-live="polite"
			>
				{toasts.map((t) => (
					<div
						key={t.id}
						className="rounded-lg border border-(--border-primary) bg-(--bg-panel) px-4 py-3 text-sm text-(--text-primary) shadow-lg"
					>
						{t.message}
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}
