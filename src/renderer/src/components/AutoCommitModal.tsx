import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
	DirectChatTransport,
	ToolLoopAgent,
	tool,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { z } from "zod";
import { Loader2, Check, AlertCircle, Send, FileText, Bot } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";
import { cn } from "../lib/cn";
import { createModelFromSettings } from "../lib/create-model";
import { AUTO_COMMIT_SYSTEM_PROMPT } from "../lib/auto-commit-prompt";
import type { AIProviderInstance } from "../../../shared/types";

// ---------------------------------------------------------------------------
// Tool definitions (factory, capturing projectId)
// ---------------------------------------------------------------------------

function createTools(projectId: string) {
	return {
		get_status: tool({
			description:
				"Get the current repository status including all staged, unstaged, and untracked files",
			inputSchema: z.object({}),
			execute: async () => {
				const status = await window.gitagen.repo.getStatus(projectId);
				return status ?? { staged: [], unstaged: [], untracked: [] };
			},
		}),

		get_all_diffs: tool({
			description: "Get diffs for all changed files at once",
			inputSchema: z.object({}),
			execute: async () => {
				return await window.gitagen.repo.getAllDiffs(projectId);
			},
		}),

		get_file_diff: tool({
			description: "Get the diff for a single file",
			inputSchema: z.object({
				filePath: z.string(),
				scope: z.enum(["staged", "unstaged", "untracked"]),
			}),
			execute: async ({ filePath, scope }) => {
				const patch = await window.gitagen.repo.getPatch(projectId, filePath, scope);
				return patch ?? "";
			},
		}),

		get_log: tool({
			description: "Get recent commit history to check if this is a new repository",
			inputSchema: z.object({
				limit: z.number().optional(),
			}),
			execute: async ({ limit }) => {
				return await window.gitagen.repo.getLog(projectId, { limit: limit ?? 10 });
			},
		}),

		unstage_all: tool({
			description: "Unstage all currently staged files, clearing the staging area",
			inputSchema: z.object({}),
			execute: async () => {
				await window.gitagen.repo.unstageAll(projectId);
				return { success: true };
			},
		}),

		stage_files: tool({
			description: "Stage specific files for the next commit",
			inputSchema: z.object({
				paths: z.array(z.string()),
			}),
			execute: async ({ paths }) => {
				await window.gitagen.repo.stageFiles(projectId, paths);
				return { success: true, staged: paths };
			},
		}),

		create_commit: tool({
			description: "Create a git commit with the currently staged files",
			inputSchema: z.object({
				message: z.string(),
			}),
			execute: async ({ message }) => {
				const result = await window.gitagen.repo.commit(projectId, message);
				return result;
			},
		}),

		propose_commits: {
			description:
				"Present the commit plan to the user for approval. ALWAYS use this tool to present your plan.",
			inputSchema: z.object({
				summary: z.string(),
				commits: z.array(
					z.object({
						type: z.string(),
						message: z.string(),
						files: z.array(z.string()),
						reasoning: z.string(),
					})
				),
			}),
			outputSchema: z.string(),
		},
	};
}

// ---------------------------------------------------------------------------
// Tool label map
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
	get_status: "Checking repository status",
	get_all_diffs: "Reading file diffs",
	get_file_diff: "Reading file diff",
	get_log: "Checking commit history",
	unstage_all: "Clearing staging area",
	stage_files: "Staging files",
	create_commit: "Creating commit",
};

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function getToolName(part: { type: string; toolName?: string }): string | null {
	if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
	if (part.type.startsWith("tool-")) return part.type.slice(5);
	return null;
}

interface ToolStepProps {
	toolName: string;
	state: string;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
}

function ToolStep({ toolName, state, input, output }: ToolStepProps) {
	const isLoading = state === "input-streaming" || state === "input-available";
	const isDone = state === "output-available";
	const isError = state === "output-error";

	let detail: string | null = null;
	if (toolName === "stage_files" && !isLoading && input?.paths) {
		detail = `${(input.paths as string[]).length} files`;
	}
	if (toolName === "create_commit" && isDone && output?.oid) {
		detail = String(output.oid).slice(0, 7);
	}
	if (toolName === "create_commit" && !isLoading && input?.message) {
		detail = String(input.message);
	}

	return (
		<div className="ac-tool-step">
			{isLoading ? (
				<Loader2 size={14} className="ac-tool-icon animate-spin text-(--accent)" />
			) : isDone ? (
				<Check size={14} className="ac-tool-icon text-(--success)" />
			) : isError ? (
				<AlertCircle size={14} className="ac-tool-icon text-(--danger)" />
			) : null}
			<span className="ac-tool-label">{TOOL_LABELS[toolName] ?? toolName}</span>
			{detail && <span className="ac-tool-detail">{detail}</span>}
		</div>
	);
}

interface CommitProposalProps {
	state: string;
	input?: {
		summary?: string;
		commits?: { type: string; message: string; files: string[]; reasoning: string }[];
	};
	output?: unknown;
	toolCallId: string;
	onApprove: (toolCallId: string) => void;
	onRevise: (toolCallId: string, feedback: string) => void;
}

function CommitProposal({
	state,
	input,
	output,
	toolCallId,
	onApprove,
	onRevise,
}: CommitProposalProps) {
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedback, setFeedback] = useState("");

	if (state === "input-streaming") {
		return (
			<div className="ac-proposal-loading">
				<Loader2 size={14} className="animate-spin text-(--accent)" />
				<span>Preparing commit plan...</span>
			</div>
		);
	}

	if (state === "output-available") {
		const approved = output === "approved";
		return (
			<div className="ac-proposal-resolved">
				{approved ? (
					<Check size={14} className="text-(--success)" />
				) : (
					<AlertCircle size={14} className="text-(--warning)" />
				)}
				<span>{approved ? "Plan approved" : "Revision requested"}</span>
			</div>
		);
	}

	if (state === "output-error") {
		return (
			<div className="ac-proposal-resolved">
				<AlertCircle size={14} className="text-(--danger)" />
				<span>Error</span>
			</div>
		);
	}

	const commits = input?.commits ?? [];
	const summary = input?.summary ?? "";

	const handleApprove = () => {
		onApprove(toolCallId);
	};

	const handleRevise = () => {
		if (showFeedback && feedback.trim()) {
			onRevise(toolCallId, feedback.trim());
			setShowFeedback(false);
			setFeedback("");
		} else {
			setShowFeedback(true);
		}
	};

	return (
		<div className="ac-proposal">
			{summary && <p className="ac-proposal-summary">{summary}</p>}

			<div className="ac-proposal-cards">
				{commits.map((commit, i) => (
					<div key={i} className="ac-commit-card">
						<div className="ac-commit-header">
							<span className="ac-commit-badge" data-type={commit.type}>
								{commit.type}
							</span>
							<span className="ac-commit-message">{commit.message}</span>
						</div>
						<div className="ac-commit-files">
							{commit.files.map((file) => (
								<span key={file} className="ac-file-chip">
									<FileText size={11} />
									{file}
								</span>
							))}
						</div>
						{commit.reasoning && (
							<p className="ac-commit-reasoning">{commit.reasoning}</p>
						)}
					</div>
				))}
			</div>

			<div className="ac-proposal-actions">
				<button type="button" className="btn btn-primary" onClick={handleApprove}>
					<Check size={14} />
					Approve
				</button>
				<button type="button" className="btn btn-secondary" onClick={handleRevise}>
					Revise
				</button>
			</div>

			{showFeedback && (
				<div className="ac-feedback">
					<input
						type="text"
						className="input"
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && feedback.trim()) handleRevise();
						}}
						placeholder="Describe what to change..."
						autoFocus
					/>
					<button
						type="button"
						className="btn btn-primary"
						onClick={handleRevise}
						disabled={!feedback.trim()}
					>
						<Send size={13} />
					</button>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// AutoCommitChat — the inner component (rendered once provider is ready)
// ---------------------------------------------------------------------------

interface AutoCommitChatProps {
	projectId: string;
	provider: AIProviderInstance;
	onClose: () => void;
}

function AutoCommitChat({ projectId, provider, onClose: _onClose }: AutoCommitChatProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentRef = useRef(false);

	const agent = useMemo(
		() =>
			new ToolLoopAgent({
				model: createModelFromSettings(provider),
				instructions: AUTO_COMMIT_SYSTEM_PROMPT,
				tools: createTools(projectId),
			}),
		[projectId, provider]
	);

	const transport = useMemo(() => new DirectChatTransport({ agent }), [agent]);

	const { messages, sendMessage, addToolOutput, status, error } = useChat({
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
	});

	const isLoading = status === "submitted" || status === "streaming";

	// Auto-start analysis on mount
	useEffect(() => {
		if (!sentRef.current) {
			sentRef.current = true;
			sendMessage({ text: "Analyze all changes and propose atomic commits." });
		}
	}, [sendMessage]);

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		scrollRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Chat input state
	const [input, setInput] = useState("");

	const handleSend = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed || isLoading) return;
		sendMessage({ text: trimmed });
		setInput("");
	}, [input, isLoading, sendMessage]);

	const handleApprove = useCallback(
		(toolCallId: string) => {
			addToolOutput({ tool: "propose_commits", toolCallId, output: "approved" });
		},
		[addToolOutput]
	);

	const handleRevise = useCallback(
		(toolCallId: string, feedback: string) => {
			addToolOutput({
				tool: "propose_commits",
				toolCallId,
				output: `revise: ${feedback}`,
			});
		},
		[addToolOutput]
	);

	// Render a single message part
	const renderPart = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(part: any, index: number) => {
			if (part.type === "text" && part.text) {
				return (
					<div key={index} className="ac-text">
						{part.text}
					</div>
				);
			}

			if (part.type === "step-start") {
				return index > 0 ? <hr key={index} className="ac-step-divider" /> : null;
			}

			const toolName = getToolName(part);
			if (!toolName) return null;

			if (toolName === "propose_commits") {
				return (
					<CommitProposal
						key={index}
						state={part.state}
						input={part.input}
						output={part.output}
						toolCallId={part.toolCallId}
						onApprove={handleApprove}
						onRevise={handleRevise}
					/>
				);
			}

			return (
				<ToolStep
					key={index}
					toolName={toolName}
					state={part.state}
					input={part.input}
					output={part.output}
				/>
			);
		},
		[handleApprove, handleRevise]
	);

	const footer = (
		<div className="ac-input-row">
			<input
				type="text"
				className="input flex-1"
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSend();
				}}
				placeholder={isLoading ? "Agent is working..." : "Type feedback or instructions..."}
				disabled={isLoading}
			/>
			<button
				type="button"
				className="btn btn-primary"
				onClick={handleSend}
				disabled={isLoading || !input.trim()}
			>
				<Send size={13} />
			</button>
		</div>
	);

	return (
		<ModalShell
			title="Auto-commit"
			description="AI agent analyzes and commits your changes"
			bodyClassName="ac-body"
			footer={footer}
		>
			{messages.map((message) => (
				<div
					key={message.id}
					className={cn(
						"ac-message",
						message.role === "user" ? "ac-message-user" : "ac-message-assistant"
					)}
				>
					{message.role === "assistant" && (
						<div className="ac-avatar">
							<Bot size={14} />
						</div>
					)}
					<div className="ac-message-content">
						{message.parts.map((part, i) => renderPart(part, i))}
					</div>
				</div>
			))}

			{isLoading && messages.length === 0 && (
				<div className="ac-loading-initial">
					<Loader2 size={16} className="animate-spin text-(--accent)" />
					<span>Starting analysis...</span>
				</div>
			)}

			{error && (
				<div className="ac-error">
					<AlertCircle size={14} />
					<span>{error.message}</span>
				</div>
			)}

			<div ref={scrollRef} />
		</ModalShell>
	);
}

// ---------------------------------------------------------------------------
// AutoCommitModal — outer wrapper (handles settings fetch + Dialog)
// ---------------------------------------------------------------------------

interface AutoCommitModalProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
}

export default function AutoCommitModal({ open, onClose, projectId }: AutoCommitModalProps) {
	const [provider, setProvider] = useState<AIProviderInstance | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!open) {
			setProvider(null);
			setInitError(null);
			setLoading(true);
			return;
		}

		let cancelled = false;

		window.gitagen.settings
			.getGlobalWithKeys()
			.then((settings) => {
				if (cancelled) return;
				const { activeProviderId, providers } = settings.ai;
				if (!activeProviderId) {
					setInitError("No AI provider configured. Add one in Settings.");
					setLoading(false);
					return;
				}
				const instance = providers.find((p) => p.id === activeProviderId);
				if (!instance) {
					setInitError("AI provider not found. Reconfigure in Settings.");
					setLoading(false);
					return;
				}
				if (!instance.apiKey?.trim()) {
					setInitError("AI provider missing API key. Add it in Settings.");
					setLoading(false);
					return;
				}
				if (!instance.defaultModel?.trim()) {
					setInitError("No model selected. Select a model in Settings.");
					setLoading(false);
					return;
				}
				setProvider(instance);
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				setInitError(err instanceof Error ? err.message : "Failed to load settings");
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent size="lg" className="p-0">
				{loading ? (
					<ModalShell title="Auto-commit">
						<div className="ac-loading-initial">
							<Loader2 size={16} className="animate-spin text-(--accent)" />
							<span>Loading AI settings...</span>
						</div>
					</ModalShell>
				) : initError ? (
					<ModalShell
						title="Auto-commit"
						footer={
							<button type="button" className="btn btn-secondary" onClick={onClose}>
								Close
							</button>
						}
					>
						<div className="ac-error">
							<AlertCircle size={14} />
							<span>{initError}</span>
						</div>
					</ModalShell>
				) : provider ? (
					<AutoCommitChat projectId={projectId} provider={provider} onClose={onClose} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
