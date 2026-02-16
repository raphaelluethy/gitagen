import { useState } from "react";
import { Send } from "lucide-react";

interface CommitPanelProps {
	projectId: string;
	onCommit: () => void;
	disabled?: boolean;
}

export default function CommitPanel({ projectId, onCommit, disabled }: CommitPanelProps) {
	const [message, setMessage] = useState("");
	const [amend, setAmend] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCommit = async () => {
		const trimmed = message.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(null);
		try {
			await window.gitagen.repo.commit(projectId, trimmed, { amend });
			setMessage("");
			onCommit();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Commit failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
			<textarea
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				placeholder="Commit message..."
				rows={2}
				className="w-full resize-none rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
				disabled={disabled}
			/>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-3">
					<label className="flex items-center gap-1.5 text-xs">
						<input
							type="checkbox"
							checked={amend}
							onChange={(e) => setAmend(e.target.checked)}
							className="rounded"
						/>
						Amend
					</label>
				</div>
				<div className="flex items-center gap-2">
					{error && (
						<span className="text-xs text-red-600 dark:text-red-400">{error}</span>
					)}
					<button
						type="button"
						onClick={handleCommit}
						disabled={disabled || loading || !message.trim()}
						className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
					>
						<Send size={14} />
						{loading ? "..." : "Commit"}
					</button>
				</div>
			</div>
		</div>
	);
}
