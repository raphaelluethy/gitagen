import { useState, useEffect, useCallback } from "react";
import { tool } from "ai";
import { z } from "zod";
import { Loader2, Check, AlertCircle, Send, FileText } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";
import AgentChatModal, {
	type AgentChatToolHelpers,
	type AgentToolPartRenderArgs,
} from "./agent/AgentChatModal";
import { AUTO_COMMIT_SYSTEM_PROMPT } from "../lib/auto-commit-prompt";
import type { AIProviderInstance } from "../../../shared/types";

function createAutoCommitTools(projectId: string, helpers: AgentChatToolHelpers) {
	const { runTool } = helpers;

	return {
		get_status: tool({
			description:
				"Get the current repository status including all staged, unstaged, and untracked files",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("get_status", ctx ?? {}, async () => {
					const status = await window.gitagen.repo.getStatus(projectId);
					return status ?? { staged: [], unstaged: [], untracked: [] };
				}),
		}),

		get_all_diffs: tool({
			description: "Get diffs for all changed files at once",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("get_all_diffs", ctx ?? {}, async () => {
					return await window.gitagen.repo.getAllDiffs(projectId);
				}),
		}),

		get_file_diff: tool({
			description: "Get the diff for a single file",
			inputSchema: z.object({
				filePath: z.string(),
				scope: z.enum(["staged", "unstaged", "untracked"]),
			}),
			execute: async ({ filePath, scope }, ctx) =>
				runTool("get_file_diff", ctx ?? {}, async () => {
					const patch = await window.gitagen.repo.getPatch(projectId, filePath, scope);
					return patch ?? "";
				}),
		}),

		get_log: tool({
			description: "Get recent commit history to check if this is a new repository",
			inputSchema: z.object({
				limit: z.number().optional(),
			}),
			execute: async ({ limit }, ctx) =>
				runTool("get_log", ctx ?? {}, async () => {
					return await window.gitagen.repo.getLog(projectId, { limit: limit ?? 10 });
				}),
		}),

		unstage_all: tool({
			description: "Unstage all currently staged files, clearing the staging area",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("unstage_all", ctx ?? {}, async () => {
					await window.gitagen.repo.unstageAll(projectId);
					return { success: true };
				}),
		}),

		stage_files: tool({
			description: "Stage specific files for the next commit",
			inputSchema: z.object({
				paths: z.array(z.string()),
			}),
			execute: async ({ paths }, ctx) =>
				runTool("stage_files", ctx ?? {}, async () => {
					await window.gitagen.repo.stageFiles(projectId, paths);
					return { success: true, staged: paths };
				}),
		}),

		create_commit: tool({
			description: "Create a git commit with the currently staged files",
			inputSchema: z.object({
				message: z.string(),
			}),
			execute: async ({ message }, ctx) =>
				runTool("create_commit", ctx ?? {}, async () => {
					const result = await window.gitagen.repo.commit(projectId, message);
					return result;
				}),
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

function getToolName(part: { type: string; toolName?: string }): string | null {
	if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
	if (part.type.startsWith("tool-")) return part.type.slice(5);
	return null;
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
					if (instance.apiKey.includes("...")) {
						setInitError(
							"AI provider API key appears masked. Re-enter the full key in Settings."
						);
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

	const toolsFactory = useCallback(
		(helpers: AgentChatToolHelpers) => createAutoCommitTools(projectId, helpers),
		[projectId]
	);

	const renderAutoCommitTool = useCallback((args: AgentToolPartRenderArgs) => {
		const toolName = getToolName(args.part);
		if (toolName !== "propose_commits") return null;
		const toolCallId = args.part.toolCallId;
		if (!toolCallId) return null;

		return (
			<CommitProposal
				state={args.part.state ?? "input-available"}
				input={args.part.input as CommitProposalProps["input"]}
				output={args.part.output}
				toolCallId={toolCallId}
				onApprove={(id) => args.onToolOutput("propose_commits", id, "approved")}
				onRevise={(id, feedback) =>
					args.onToolOutput("propose_commits", id, `revise: ${feedback}`)
				}
			/>
		);
	}, []);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent size="lg" className="p-0" aria-describedby={undefined}>
				{loading ? (
					<ModalShell
						title="Auto-commit"
						description="AI agent analyzes and commits your changes"
					>
						<div className="ac-loading-initial">
							<Loader2 size={16} className="animate-spin text-(--accent)" />
							<span>Loading AI settings...</span>
						</div>
					</ModalShell>
				) : initError ? (
					<ModalShell
						title="Auto-commit"
						description="AI agent analyzes and commits your changes"
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
					<AgentChatModal
						title="Auto-commit"
						description="AI agent analyzes and commits your changes"
						provider={provider}
						instructions={AUTO_COMMIT_SYSTEM_PROMPT}
						initialPrompt="Analyze all changes and propose a small set of cohesive commits (avoid over-splitting)."
						traceKey="auto-commit"
						createTools={toolsFactory}
						renderToolPart={renderAutoCommitTool}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
