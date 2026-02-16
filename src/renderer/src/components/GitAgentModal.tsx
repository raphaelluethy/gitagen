import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";
import AgentChatModal, {
	type AgentChatToolHelpers,
	type AgentToolPartRenderArgs,
} from "./agent/AgentChatModal";
import { GIT_AGENT_SYSTEM_PROMPT } from "../lib/git-agent-prompt";
import { createGitAgentTools } from "./git-agent/tools";
import GitActionProposal, { type GitActionPlanInput } from "./git-agent/GitActionProposal";
import type { AIProviderInstance } from "../../../shared/types";

interface GitAgentModalProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
	initialPrompt?: string;
}

interface PlanGateState {
	proposedPlanId: string | null;
	approvedPlanId: string | null;
}

const WRITE_TOOLS = new Set([
	"stage_files",
	"unstage_files",
	"stage_all",
	"unstage_all",
	"create_commit",
	"stash_create",
	"stash_apply",
	"stash_pop",
	"fetch",
	"pull",
	"push",
	"switch_branch",
	"create_branch",
]);

function getToolName(part: { type: string; toolName?: string }): string | null {
	if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
	if (part.type.startsWith("tool-")) return part.type.slice(5);
	return null;
}

function getToolStateLabel(state?: string): string {
	if (state === "output-available") return "done";
	if (state === "output-error") return "failed";
	if (state === "input-streaming") return "running";
	return "running";
}

function summarizePaths(paths: unknown): string | null {
	if (!Array.isArray(paths)) return null;
	const clean = paths.filter((item): item is string => typeof item === "string");
	if (clean.length === 0) return null;
	const head = clean.slice(0, 3).join(", ");
	return clean.length > 3 ? `${head} +${clean.length - 3} more` : head;
}

function summarizeToolInput(toolName: string, input: unknown): string | null {
	if (!input || typeof input !== "object") return null;
	const data = input as Record<string, unknown>;
	switch (toolName) {
		case "stage_files":
		case "unstage_files": {
			const preview = summarizePaths(data.paths);
			return preview ? `Files: ${preview}` : null;
		}
		case "create_commit": {
			const message = typeof data.message === "string" ? data.message.trim() : "";
			if (!message) return null;
			const firstLine = message.split("\n")[0] ?? "";
			return `Message: ${firstLine}`;
		}
		case "switch_branch":
		case "create_branch": {
			const name = typeof data.name === "string" ? data.name : "";
			return name ? `Branch: ${name}` : null;
		}
		case "fetch":
		case "pull":
		case "push": {
			const remote = typeof data.remote === "string" ? data.remote : "";
			const branch = typeof data.branch === "string" ? data.branch : "";
			if (remote && branch) return `Remote: ${remote}, Branch: ${branch}`;
			if (remote) return `Remote: ${remote}`;
			if (branch) return `Branch: ${branch}`;
			return null;
		}
		case "stash_apply":
		case "stash_pop": {
			return typeof data.index === "number" ? `Entry: stash@{${data.index}}` : "Latest entry";
		}
		default:
			return null;
	}
}

export default function GitAgentModal({
	open,
	onClose,
	projectId,
	initialPrompt,
}: GitAgentModalProps) {
	const [provider, setProvider] = useState<AIProviderInstance | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const planGateRef = useRef<PlanGateState>({
		proposedPlanId: null,
		approvedPlanId: null,
	});

	useEffect(() => {
		if (!open) {
			setProvider(null);
			setInitError(null);
			setLoading(true);
			planGateRef.current = {
				proposedPlanId: null,
				approvedPlanId: null,
			};
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
			.catch((error) => {
				if (cancelled) return;
				setInitError(error instanceof Error ? error.message : "Failed to load settings");
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	const toolsFactory = useCallback(
		(helpers: AgentChatToolHelpers) =>
			createGitAgentTools(projectId, helpers, {
				getApprovedPlanId: () => planGateRef.current.approvedPlanId,
			}),
		[projectId]
	);

	const renderGitAgentTool = useCallback((args: AgentToolPartRenderArgs) => {
		const toolName = getToolName(args.part);
		if (!toolName) return null;
		if (toolName !== "propose_actions") {
			const state = args.part.state ?? "input-available";
			const statusLabel = getToolStateLabel(state);
			const summary = summarizeToolInput(toolName, args.part.input);
			const writeTool = WRITE_TOOLS.has(toolName);

			return (
				<div className="ga-tool-step">
					<div className="ga-tool-row">
						<span className="ga-tool-badge" data-type={writeTool ? "write" : "read"}>
							{writeTool ? "WRITE" : "READ"}
						</span>
						<span className="ga-tool-name">{toolName}</span>
						<span
							className="ga-tool-state"
							data-state={
								statusLabel === "done"
									? "done"
									: statusLabel === "failed"
										? "failed"
										: "running"
							}
						>
							{statusLabel}
						</span>
					</div>
					{summary && <p className="ga-tool-summary">{summary}</p>}
					{state === "output-error" && args.part.errorText && (
						<p className="ga-tool-error">{args.part.errorText}</p>
					)}
				</div>
			);
		}
		const toolCallId = args.part.toolCallId;
		if (!toolCallId) return null;
		const state = args.part.state ?? "input-available";
		const input = (args.part.input as GitActionPlanInput | undefined) ?? undefined;

		const proposedPlanId = input?.planId?.trim() ?? "";
		if (
			(state === "input-streaming" || state === "input-available") &&
			proposedPlanId !== "" &&
			planGateRef.current.proposedPlanId !== proposedPlanId
		) {
			planGateRef.current.proposedPlanId = proposedPlanId;
			planGateRef.current.approvedPlanId = null;
		}

		return (
			<GitActionProposal
				state={state}
				input={input}
				output={args.part.output}
				toolCallId={toolCallId}
				isLoading={args.isLoading}
				onApprove={(id, planId) => {
					planGateRef.current.approvedPlanId = planId;
					args.onToolOutput("propose_actions", id, {
						decision: "approved",
						planId,
					});
				}}
				onRevise={(id, planId, feedback) => {
					planGateRef.current.approvedPlanId = null;
					args.onToolOutput("propose_actions", id, {
						decision: "revise",
						planId,
						feedback,
					});
				}}
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
						title="GitAgent"
						description="AI assistant for practical git workflows"
					>
						<div className="ac-loading-initial">
							<Loader2 size={16} className="animate-spin text-(--accent)" />
							<span>Loading AI settings...</span>
						</div>
					</ModalShell>
				) : initError ? (
					<ModalShell
						title="GitAgent"
						description="AI assistant for practical git workflows"
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
						title="GitAgent"
						description="AI assistant for practical git workflows"
						provider={provider}
						instructions={GIT_AGENT_SYSTEM_PROMPT}
						initialPrompt={initialPrompt}
						traceKey="git-agent"
						createTools={toolsFactory}
						renderToolPart={renderGitAgentTool}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
