import { useState, useCallback } from "react";
import { Send, GitCommit, Sparkles } from "lucide-react";
import { useToast } from "../toast/provider";

interface CommitPanelProps {
	projectId: string;
	onCommit: () => void;
	disabled?: boolean;
}

export default function CommitPanel({ projectId, onCommit, disabled }: CommitPanelProps) {
	const [message, setMessage] = useState("");
	const [amend, setAmend] = useState(false);
	const [loading, setLoading] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { toast } = useToast();

	const handleGenerate = useCallback(async () => {
		setGenerating(true);
		setError(null);
		setMessage("");
		const unsub = window.gitagen.events.onCommitChunk((chunk) => {
			setMessage((prev) => prev + chunk);
		});
		try {
			await window.gitagen.repo.generateCommitMessage(projectId);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Failed to generate";
			toast(msg);
		} finally {
			unsub();
			setGenerating(false);
		}
	}, [projectId, toast]);

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

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			handleCommit();
		}
	};

	return (
		<div className="shrink-0 border-t border-(--border-primary) bg-(--bg-secondary) px-4 py-4">
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<GitCommit size={16} className="text-(--text-primary)" />
					<span className="font-mono text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
						Commit
					</span>
				</div>
				<button
					type="button"
					onClick={handleGenerate}
					disabled={disabled || generating}
					className="btn-icon rounded-md p-1.5"
					title="Generate commit message with AI"
				>
					<Sparkles
						size={14}
						className={generating ? "animate-pulse text-(--accent)" : ""}
					/>
				</button>
			</div>
			<textarea
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Enter commit message... (⌘+Enter to commit)"
				rows={3}
				className="input commit-message-text mb-3 resize-none rounded-md"
				disabled={disabled}
				style={{ fontSize: "var(--commit-message-font-size)" }}
			/>
			<div className="flex items-center justify-between gap-3">
				<label className="flex cursor-pointer items-center gap-2 text-xs text-(--text-secondary) hover:text-(--text-primary) transition-colors">
					<input
						type="checkbox"
						checked={amend}
						onChange={(e) => setAmend(e.target.checked)}
					/>
					Amend previous
				</label>
				<div className="flex items-center gap-3">
					{error && (
						<span className="max-w-[200px] truncate text-xs text-(--danger)">
							{error}
						</span>
					)}
					<button
						type="button"
						onClick={handleCommit}
						disabled={disabled || loading || !message.trim()}
						className="btn btn-primary rounded-full px-4"
					>
						<Send size={14} />
						{loading ? "Committing..." : "Commit"}
					</button>
				</div>
			</div>
		</div>
	);
}
