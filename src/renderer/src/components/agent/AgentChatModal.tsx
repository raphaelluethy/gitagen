import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import {
	DirectChatTransport,
	ToolLoopAgent,
	lastAssistantMessageIsCompleteWithToolCalls,
	stepCountIs,
	type ToolSet,
} from "ai";
import { Loader2, Check, AlertCircle, Send, Bot } from "lucide-react";
import { ModalShell } from "../ui/modal-shell";
import { cn } from "../../lib/cn";
import { createModelFromSettings } from "../../lib/create-model";
import type { AIProviderInstance } from "../../../../shared/types";

const TOOL_TIMEOUT_MS = 30_000;
const AGENT_STEP_TIMEOUT_MS = 45_000;
const AGENT_CHUNK_TIMEOUT_MS = 12_000;
const TRACE_MAX_ENTRIES = 200;

export type TraceLevel = "info" | "warn" | "error";

interface TraceEntry {
	id: string;
	level: TraceLevel;
	message: string;
	at: number;
}

export interface AgentToolExecContext {
	toolCallId?: string;
}

interface ToolRunState {
	key: string;
	toolName: string;
	toolCallId: string;
	status: "running" | "done" | "failed";
	startedAt: number;
	endedAt?: number;
	error?: string;
}

export type TraceLogger = (level: TraceLevel, message: string) => void;

export interface AgentChatToolHelpers {
	trace: TraceLogger;
	runTool: <T>(toolName: string, ctx: AgentToolExecContext, run: () => Promise<T>) => Promise<T>;
}

interface ToolPart {
	type: string;
	toolName?: string;
	toolCallId?: string;
	state?: string;
	providerExecuted?: boolean;
	input?: unknown;
	output?: unknown;
	errorText?: string;
	text?: string;
}

export interface AgentToolPartRenderArgs {
	part: ToolPart;
	onToolOutput: (tool: string, toolCallId: string, output: unknown) => void;
	onToolError: (tool: string, toolCallId: string, errorText: string) => void;
	isLoading: boolean;
}

export interface AgentChatModalProps {
	title: string;
	description?: string;
	provider: AIProviderInstance;
	instructions: string;
	initialPrompt?: string;
	traceKey?: string;
	createTools: (helpers: AgentChatToolHelpers) => ToolSet;
	renderToolPart?: (args: AgentToolPartRenderArgs) => ReactNode | null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((result) => {
				window.clearTimeout(timer);
				resolve(result);
			})
			.catch((error: unknown) => {
				window.clearTimeout(timer);
				reject(error);
			});
	});
}

function getToolName(part: ToolPart): string | null {
	if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
	if (part.type.startsWith("tool-")) return part.type.slice(5);
	return null;
}

function getToolLabel(toolName: string): string {
	return toolName
		.split(/[_-]/g)
		.filter(Boolean)
		.map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
		.join(" ");
}

function toDisplayText(value: unknown, max = 420): string | null {
	if (value === undefined) return null;
	try {
		const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
		if (!raw) return null;
		return raw.length > max ? `${raw.slice(0, max)}…` : raw;
	} catch {
		return String(value);
	}
}

function runKey(toolName: string, toolCallId: string): string {
	return `${toolName}:${toolCallId}`;
}

interface ThinkingBlockProps {
	text: string;
	state?: string;
}

function ThinkingBlock({ text, state }: ThinkingBlockProps) {
	const isStreaming = state === "streaming";
	return (
		<details className="ac-thinking" open={isStreaming}>
			<summary className="ac-thinking-summary">
				{isStreaming ? (
					<Loader2 size={12} className="animate-spin text-(--accent)" />
				) : (
					<Bot size={12} className="text-(--text-muted)" />
				)}
				<span>Thinking</span>
			</summary>
			<div className="ac-thinking-body">{text}</div>
		</details>
	);
}

interface ToolStepProps {
	toolName: string;
	toolCallId: string;
	state: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
	run?: ToolRunState;
	now: number;
}

function ToolStep({
	toolName,
	toolCallId,
	state,
	input,
	output,
	errorText,
	run,
	now,
}: ToolStepProps) {
	const runElapsedMs = run ? (run.endedAt ?? now) - run.startedAt : null;
	const isStalled =
		run?.status === "running" && runElapsedMs != null && runElapsedMs > TOOL_TIMEOUT_MS;

	const statusKind =
		run?.status === "done"
			? "done"
			: run?.status === "failed"
				? "failed"
				: isStalled
					? "failed"
					: state === "output-available"
						? "done"
						: state === "output-error"
							? "failed"
							: "running";

	const statusLabel =
		statusKind === "done"
			? "done"
			: statusKind === "failed"
				? isStalled
					? "stalled"
					: "failed"
				: "running";

	let detail: string | null = null;
	if (statusKind === "failed") {
		detail = run?.error ?? errorText ?? null;
	}
	if (!detail && runElapsedMs != null) {
		detail = `${(runElapsedMs / 1000).toFixed(1)}s`;
	}

	const inputText = toDisplayText(input);
	const outputText = toDisplayText(output);

	return (
		<div className="ac-tool-step">
			<div className="ac-tool-row">
				{statusKind === "running" ? (
					<Loader2 size={14} className="ac-tool-icon animate-spin text-(--accent)" />
				) : statusKind === "done" ? (
					<Check size={14} className="ac-tool-icon text-(--success)" />
				) : (
					<AlertCircle size={14} className="ac-tool-icon text-(--danger)" />
				)}
				<span className="ac-tool-label">{getToolLabel(toolName)}</span>
				<span
					className={cn(
						"ac-tool-state",
						statusKind === "done" && "ac-tool-state-done",
						statusKind === "failed" && "ac-tool-state-error"
					)}
				>
					{statusLabel}
				</span>
				<span className="ac-tool-call-id">#{toolCallId.slice(0, 8)}</span>
			</div>
			{detail && (
				<div
					className={cn(
						"ac-tool-detail",
						statusKind === "failed" && "ac-tool-detail-error"
					)}
				>
					{detail}
				</div>
			)}
			{(inputText || outputText) && (
				<details className="ac-tool-payload">
					<summary>Details</summary>
					{inputText && (
						<div className="ac-tool-payload-block">
							<div className="ac-tool-payload-title">Input</div>
							<pre>{inputText}</pre>
						</div>
					)}
					{outputText && (
						<div className="ac-tool-payload-block">
							<div className="ac-tool-payload-title">Output</div>
							<pre>{outputText}</pre>
						</div>
					)}
				</details>
			)}
		</div>
	);
}

export default function AgentChatModal({
	title,
	description,
	provider,
	instructions,
	initialPrompt,
	traceKey = "agent",
	createTools,
	renderToolPart,
}: AgentChatModalProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentRef = useRef(false);
	const stalledLoggedRef = useRef<Set<string>>(new Set());
	const unresolvedLoggedRef = useRef<Set<string>>(new Set());
	const seenPartStateRef = useRef<Map<string, string>>(new Map());
	const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
	const [toolRuns, setToolRuns] = useState<Record<string, ToolRunState>>({});
	const [now, setNow] = useState(Date.now());
	const [input, setInput] = useState("");
	const verboseDebug = import.meta.env.VITE_AGENT_DEBUG === "1";

	const appendTrace = useCallback(
		(level: TraceLevel, message: string) => {
			const entry: TraceEntry = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				level,
				message,
				at: Date.now(),
			};
			setTraceEntries((prev) => [...prev, entry].slice(-TRACE_MAX_ENTRIES));

			const prefix = `[${traceKey}]`;
			if (level === "error") {
				console.error(prefix, message);
				return;
			}
			if (level === "warn") {
				console.warn(prefix, message);
				return;
			}
			if (verboseDebug) {
				console.info(prefix, message);
			}
		},
		[traceKey, verboseDebug]
	);

	const runTool = useCallback(
		async <T,>(
			toolName: string,
			ctx: AgentToolExecContext,
			run: () => Promise<T>
		): Promise<T> => {
			const startedAt = Date.now();
			const toolCallId = ctx?.toolCallId ?? `${toolName}-${startedAt}`;
			const key = runKey(toolName, toolCallId);
			setToolRuns((prev) => ({
				...prev,
				[key]: {
					key,
					toolName,
					toolCallId,
					status: "running",
					startedAt,
				},
			}));
			appendTrace("info", `${toolName}#${toolCallId} started`);

			try {
				const result = await withTimeout(
					run(),
					TOOL_TIMEOUT_MS,
					`${toolName}#${toolCallId}`
				);
				const endedAt = Date.now();
				setToolRuns((prev) => ({
					...prev,
					[key]: {
						...(prev[key] ?? {
							key,
							toolName,
							toolCallId,
							startedAt,
						}),
						status: "done",
						endedAt,
					},
				}));
				appendTrace(
					"info",
					`${toolName}#${toolCallId} completed in ${endedAt - startedAt}ms`
				);
				return result;
			} catch (error) {
				const endedAt = Date.now();
				const message = error instanceof Error ? error.message : String(error);
				setToolRuns((prev) => ({
					...prev,
					[key]: {
						...(prev[key] ?? {
							key,
							toolName,
							toolCallId,
							startedAt,
						}),
						status: "failed",
						endedAt,
						error: message,
					},
				}));
				appendTrace(
					"error",
					`${toolName}#${toolCallId} failed after ${endedAt - startedAt}ms: ${message}`
				);
				throw error;
			}
		},
		[appendTrace]
	);

	const tools = useMemo(
		() => createTools({ trace: appendTrace, runTool }),
		[appendTrace, createTools, runTool]
	);

	const agent = useMemo(
		() =>
			new ToolLoopAgent({
				model: createModelFromSettings(provider),
				instructions,
				tools,
				stopWhen: stepCountIs(20),
				timeout: {
					stepMs: AGENT_STEP_TIMEOUT_MS,
					chunkMs: AGENT_CHUNK_TIMEOUT_MS,
				},
				onStepFinish: (step) => {
					const calledTools = step.toolCalls.map((call) => call.toolName).join(", ");
					const resolvedTools = step.toolResults
						.map((result) => result.toolName)
						.join(", ");
					appendTrace(
						"info",
						[
							`step finished reason=${step.finishReason}`,
							calledTools ? `calls=[${calledTools}]` : null,
							resolvedTools ? `results=[${resolvedTools}]` : null,
							step.warnings?.length ? `warnings=${step.warnings.length}` : null,
						]
							.filter(Boolean)
							.join(" ")
					);
				},
				onFinish: ({ finishReason, steps }) => {
					appendTrace(
						"info",
						`agent loop finished reason=${finishReason} steps=${steps.length}`
					);
				},
			}),
		[appendTrace, instructions, provider, tools]
	);

	const transport = useMemo(
		() =>
			new DirectChatTransport({
				agent,
				sendReasoning: true,
				sendSources: true,
			}),
		[agent]
	);

	const { messages, sendMessage, addToolOutput, status, error } = useChat({
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		onError: (chatError) => {
			const message =
				chatError instanceof Error ? chatError.message : "Chat request failed unexpectedly";
			appendTrace("error", `chat error: ${message}`);
		},
		onFinish: ({ finishReason, isAbort, isDisconnect, isError }) => {
			appendTrace(
				isError ? "error" : "info",
				`assistant finished (reason=${finishReason ?? "unknown"}, abort=${String(isAbort)}, disconnect=${String(isDisconnect)})`
			);
		},
	});

	const isLoading = status === "submitted" || status === "streaming";

	useEffect(() => {
		appendTrace(
			"info",
			`session started with provider=${provider.name} type=${provider.type} model=${provider.defaultModel}`
		);
	}, [appendTrace, provider.defaultModel, provider.name, provider.type]);

	useEffect(() => {
		appendTrace("info", `status=${status}`);
	}, [appendTrace, status]);

	useEffect(() => {
		if (!initialPrompt || initialPrompt.trim() === "") return;
		if (sentRef.current) return;
		const timer = window.setTimeout(() => {
			if (sentRef.current) return;
			sentRef.current = true;
			appendTrace("info", `sending initial prompt: ${initialPrompt}`);
			sendMessage({ text: initialPrompt });
		}, 0);

		return () => window.clearTimeout(timer);
	}, [appendTrace, initialPrompt, sendMessage]);

	useEffect(() => {
		scrollRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		for (const run of Object.values(toolRuns)) {
			if (run.status !== "running") continue;
			if (now - run.startedAt <= TOOL_TIMEOUT_MS) continue;
			if (stalledLoggedRef.current.has(run.key)) continue;
			stalledLoggedRef.current.add(run.key);
			setToolRuns((prev) => ({
				...prev,
				[run.key]: {
					...run,
					status: "failed",
					endedAt: now,
					error: run.error ?? `Timed out after ${TOOL_TIMEOUT_MS}ms`,
				},
			}));
			appendTrace(
				"error",
				`${run.toolName}#${run.toolCallId} timed out after ${Math.round((now - run.startedAt) / 1000)}s`
			);
		}
	}, [appendTrace, now, toolRuns]);

	useEffect(() => {
		for (const message of messages) {
			for (const part of message.parts as ToolPart[]) {
				const toolName = getToolName(part);
				if (!toolName || !part.state) continue;
				const toolCallId = part.toolCallId ?? `${message.id}`;
				const key = runKey(toolName, toolCallId);
				const stateKey = `${key}:${part.state}`;
				if (seenPartStateRef.current.has(stateKey)) continue;
				seenPartStateRef.current.set(stateKey, part.state);
				const suffix = [
					part.providerExecuted ? " providerExecuted=true" : "",
					part.errorText ? ` - ${part.errorText}` : "",
				]
					.filter(Boolean)
					.join("");
				if (part.state === "output-error") {
					appendTrace("error", `${toolName}#${toolCallId} state=${part.state}${suffix}`);
				} else if (verboseDebug) {
					appendTrace("info", `${toolName}#${toolCallId} state=${part.state}${suffix}`);
				}
			}
		}
	}, [appendTrace, messages, verboseDebug]);

	useEffect(() => {
		if (status !== "ready") return;
		const updates: Record<string, ToolRunState> = {};
		for (const message of messages) {
			for (const part of message.parts as ToolPart[]) {
				const toolName = getToolName(part);
				if (!toolName || !part.state || !part.toolCallId) continue;
				if (part.state !== "input-streaming" && part.state !== "input-available") continue;
				const key = runKey(toolName, part.toolCallId);
				const current = toolRuns[key];
				if (current?.status === "done" || current?.status === "failed") continue;
				if (unresolvedLoggedRef.current.has(key)) continue;
				unresolvedLoggedRef.current.add(key);
				const inputSummary = toDisplayText(part.input, 120);
				updates[key] = {
					key,
					toolName,
					toolCallId: part.toolCallId,
					status: "failed",
					startedAt: current?.startedAt ?? Date.now(),
					endedAt: Date.now(),
					error: `No tool result received (final part state=${part.state})`,
				};
				appendTrace(
					"error",
					`unresolved tool call ${toolName}#${part.toolCallId} state=${part.state}${inputSummary ? ` input=${inputSummary}` : ""}`
				);
			}
		}
		if (Object.keys(updates).length > 0) {
			setToolRuns((prev) => ({ ...prev, ...updates }));
		}
	}, [appendTrace, messages, status, toolRuns]);

	const handleSend = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed || isLoading) return;
		appendTrace("info", `user message: ${trimmed}`);
		sendMessage({ text: trimmed });
		setInput("");
	}, [appendTrace, input, isLoading, sendMessage]);

	const onToolOutput = useCallback(
		(toolName: string, toolCallId: string, output: unknown) => {
			appendTrace("info", `tool output submitted: ${toolName}#${toolCallId}`);
			void addToolOutput({
				tool: toolName as never,
				toolCallId,
				output: output as never,
			});
		},
		[addToolOutput, appendTrace]
	);

	const onToolError = useCallback(
		(toolName: string, toolCallId: string, errorText: string) => {
			appendTrace(
				"error",
				`tool output error submitted: ${toolName}#${toolCallId}: ${errorText}`
			);
			void addToolOutput({
				state: "output-error",
				tool: toolName as never,
				toolCallId,
				errorText,
			});
		},
		[addToolOutput, appendTrace]
	);

	const renderPart = useCallback(
		(part: ToolPart, index: number) => {
			if (part.type === "text" && part.text) {
				return (
					<div key={index} className="ac-text">
						{part.text}
					</div>
				);
			}

			if (part.type === "reasoning" && part.text) {
				return <ThinkingBlock key={index} text={part.text} state={part.state} />;
			}

			if (part.type === "step-start") {
				return index > 0 ? <hr key={index} className="ac-step-divider" /> : null;
			}

			const toolName = getToolName(part);
			if (!toolName) return null;

			const custom = renderToolPart?.({
				part,
				onToolOutput,
				onToolError,
				isLoading,
			});
			if (custom != null) {
				return <div key={index}>{custom}</div>;
			}

			const toolCallId = part.toolCallId ?? "unknown";
			const run = toolRuns[runKey(toolName, toolCallId)];
			return (
				<ToolStep
					key={index}
					toolName={toolName}
					toolCallId={toolCallId}
					state={part.state ?? "running"}
					input={part.input}
					output={part.output}
					errorText={part.errorText}
					run={run}
					now={now}
				/>
			);
		},
		[isLoading, now, onToolError, onToolOutput, renderToolPart, toolRuns]
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
		<ModalShell title={title} description={description} bodyClassName="ac-body" footer={footer}>
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
						{message.parts.map((part, i) => renderPart(part as ToolPart, i))}
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

			<details className="ac-trace">
				<summary>Trace ({traceEntries.length})</summary>
				<div className="ac-trace-list">
					{traceEntries.slice(-40).map((entry) => (
						<div
							key={entry.id}
							className={cn("ac-trace-entry", `ac-trace-${entry.level}`)}
						>
							<span className="ac-trace-time">
								{new Date(entry.at).toLocaleTimeString()}
							</span>
							<span>{entry.message}</span>
						</div>
					))}
				</div>
			</details>

			<div ref={scrollRef} />
		</ModalShell>
	);
}
