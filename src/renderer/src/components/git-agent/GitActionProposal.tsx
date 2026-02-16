import { useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Send, Wrench } from "lucide-react";

export interface GitActionItem {
	id?: string;
	type?: "read" | "write";
	tool: string;
	args?: unknown;
	reasoning?: string;
}

export interface GitActionPlanInput {
	planId: string;
	summary?: string;
	actions?: GitActionItem[];
}

interface GitActionDecision {
	decision: "approved" | "revise";
	planId: string;
	feedback?: string;
}

interface GitActionProposalProps {
	state: string;
	input?: GitActionPlanInput;
	output?: unknown;
	toolCallId: string;
	onApprove: (toolCallId: string, planId: string) => void;
	onRevise: (toolCallId: string, planId: string, feedback: string) => void;
	isLoading: boolean;
}

function summarizeArgs(args: unknown): string | null {
	if (args === undefined) return null;
	if (typeof args === "string") return args;
	try {
		const raw = JSON.stringify(args);
		return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
	} catch {
		return String(args);
	}
}

function toDecision(output: unknown): GitActionDecision | null {
	if (!output || typeof output !== "object") return null;
	const candidate = output as Partial<GitActionDecision>;
	if (candidate.decision !== "approved" && candidate.decision !== "revise") {
		return null;
	}
	if (typeof candidate.planId !== "string") {
		return null;
	}
	return {
		decision: candidate.decision,
		planId: candidate.planId,
		feedback: typeof candidate.feedback === "string" ? candidate.feedback : undefined,
	};
}

export default function GitActionProposal({
	state,
	input,
	output,
	toolCallId,
	onApprove,
	onRevise,
	isLoading,
}: GitActionProposalProps) {
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedback, setFeedback] = useState("");
	const actions = input?.actions ?? [];
	const summary = input?.summary ?? "";
	const planId = input?.planId ?? "";
	const decision = useMemo(() => toDecision(output), [output]);

	if (state === "input-streaming") {
		return (
			<div className="ga-proposal-loading">
				<Loader2 size={14} className="animate-spin text-(--accent)" />
				<span>Preparing action plan...</span>
			</div>
		);
	}

	if (state === "output-available") {
		const approved = decision?.decision === "approved";
		return (
			<div className="ga-proposal-resolved">
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
			<div className="ga-proposal-resolved">
				<AlertCircle size={14} className="text-(--danger)" />
				<span>Error</span>
			</div>
		);
	}

	const canApprove = !isLoading && planId.trim() !== "";
	const canRevise = !isLoading && planId.trim() !== "";

	return (
		<div className="ga-proposal">
			{summary && <p className="ga-proposal-summary">{summary}</p>}
			{planId && <p className="ga-plan-id">Plan ID: {planId}</p>}

			<div className="ga-action-list">
				{actions.map((action, index) => {
					const argSummary = summarizeArgs(action.args);
					return (
						<div
							key={`${action.id ?? action.tool}-${index}`}
							className="ga-action-card"
						>
							<div className="ga-action-header">
								<span className="ga-action-badge" data-type={action.type ?? "read"}>
									{action.type ?? "read"}
								</span>
								<span className="ga-action-tool">
									<Wrench size={11} />
									{action.tool}
								</span>
							</div>
							{argSummary && <p className="ga-action-args">{argSummary}</p>}
							{action.reasoning && (
								<p className="ga-action-reasoning">{action.reasoning}</p>
							)}
						</div>
					);
				})}
			</div>

			<div className="ga-proposal-actions">
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => onApprove(toolCallId, planId)}
					disabled={!canApprove}
				>
					<Check size={14} />
					Approve
				</button>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={() => {
						if (!showFeedback) {
							setShowFeedback(true);
							return;
						}
						if (!feedback.trim()) return;
						onRevise(toolCallId, planId, feedback.trim());
						setFeedback("");
						setShowFeedback(false);
					}}
					disabled={!canRevise}
				>
					Revise
				</button>
			</div>

			{showFeedback && (
				<div className="ga-feedback">
					<input
						type="text"
						className="input"
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && feedback.trim()) {
								onRevise(toolCallId, planId, feedback.trim());
								setFeedback("");
								setShowFeedback(false);
							}
						}}
						placeholder="Describe what should change..."
						autoFocus
					/>
					<button
						type="button"
						className="btn btn-primary"
						disabled={!feedback.trim()}
						onClick={() => {
							onRevise(toolCallId, planId, feedback.trim());
							setFeedback("");
							setShowFeedback(false);
						}}
					>
						<Send size={13} />
					</button>
				</div>
			)}
		</div>
	);
}
