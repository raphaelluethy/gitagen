import { type ReactNode, useState } from "react";
import { Toaster, toast as sonnerToast } from "sonner";
import { Copy, Check } from "lucide-react";
import { useThemeStore } from "../stores/themeStore";

interface ToastContextValue {
	toast: ((message: string) => void) & {
		success: (title: string, description?: string) => void;
		error: (title: string, description?: string) => void;
		info: (title: string, description?: string) => void;
	};
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		});
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
			title="Copy error"
		>
			{copied ? <Check size={11} /> : <Copy size={11} />}
			{copied ? "Copied" : "Copy"}
		</button>
	);
}

function createToast(): ToastContextValue["toast"] {
	const fn = ((message: string) => {
		sonnerToast(message);
	}) as ToastContextValue["toast"];

	fn.success = (title: string, description?: string) => {
		sonnerToast.success(title, { description });
	};

	fn.error = (title: string, description?: string) => {
		const copyText = description ? `${title}: ${description}` : title;
		sonnerToast.error(title, {
			description: (
				<>
					{description && <p>{description}</p>}
					<CopyButton text={copyText} />
				</>
			),
			duration: 7000,
		});
	};

	fn.info = (title: string, description?: string) => {
		sonnerToast.info(title, { description });
	};

	return fn;
}

const toastInstance = createToast();

export function ToastProvider({ children }: { children: ReactNode }) {
	const resolved = useThemeStore((s) => s.resolved);

	return (
		<>
			{children}
			<Toaster
				theme={resolved}
				position="bottom-right"
				toastOptions={{
					duration: 5000,
					style: {
						fontFamily: "var(--font-ui)",
						fontSize: "13px",
						borderRadius: "var(--radius-md)",
						border: "1px solid var(--border-primary)",
						background: "var(--bg-panel)",
						color: "var(--text-primary)",
						boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
					},
				}}
			/>
		</>
	);
}

export function useToast(): ToastContextValue {
	return { toast: toastInstance };
}
