import { useState, useCallback } from "react";
import { Send, GitCommit, Sparkles, Loader2, Bot } from "lucide-react";
import { useToast } from "../toast/provider";

interface CommitPanelProps {
	projectId: string;
	onCommit: () => void;
	onOpenGitAgent?: () => void;
	disabled?: boolean;
}

export default function CommitPanel({
	projectId,
	onCommit,
	onOpenGitAgent,
	disabled,
}: CommitPanelProps) {
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
			toast.error("Commit message generation failed", msg);
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
			toast.success("Changes committed");
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Commit failed";
			setError(msg);
			toast.error("Commit failed", msg);
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
		<div className="flex min-h-0 flex-1 flex-col bg-(--bg-secondary)">
			<div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
				<div className="flex items-center gap-1.5">
					<GitCommit size={13} className="text-(--text-muted)" />
					<span className="section-title">Commit</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={onOpenGitAgent}
						disabled={disabled || !onOpenGitAgent}
						className="btn-icon rounded-md p-1"
						title="Open GitAgent"
					>
						<Bot size={13} />
					</button>
					<button
						type="button"
						onClick={handleGenerate}
						disabled={disabled || generating}
						className="btn-icon rounded-md p-1"
						title="Generate commit message with AI"
					>
						{generating ? (
							<Loader2 size={13} className="animate-spin text-(--accent)" />
						) : (
							<Sparkles size={13} />
						)}
					</button>
				</div>
			</div>
			<textarea
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Commit message… (⌘+Enter)"
				className="input commit-message-text min-h-0 flex-1 resize-none border-x-0 border-b-0 rounded-none"
				disabled={disabled}
				style={{ fontSize: "var(--commit-message-font-size)" }}
			/>
			<div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
				<label className="flex cursor-pointer items-center gap-1.5 text-xs text-(--text-secondary) transition-colors hover:text-(--text-primary)">
					<input
						type="checkbox"
						checked={amend}
						onChange={(e) => setAmend(e.target.checked)}
					/>
					Amend
				</label>
				<div className="flex items-center gap-2">
					{error && (
						<span className="max-w-[180px] truncate text-[11px] text-(--danger)">
							{error}
						</span>
					)}
					<button
						type="button"
						onClick={handleCommit}
						disabled={disabled || loading || !message.trim()}
						className="btn btn-primary"
					>
						<Send size={13} />
						{loading ? "Committing..." : "Commit"}
					</button>
				</div>
			</div>
		</div>
	);
}
