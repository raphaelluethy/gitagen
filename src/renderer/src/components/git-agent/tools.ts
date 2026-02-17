import { tool } from "ai";
import { z } from "zod";
import type { AgentChatToolHelpers } from "../agent/AgentChatModal";

interface PlanApprovalGate {
	getApprovedPlanId: () => string | null;
}

function assertApprovedPlan(planId: string, gate: PlanApprovalGate): void {
	if (!planId.trim()) {
		throw new Error("Missing planId. Request approval with propose_actions first.");
	}
	const approvedPlanId = gate.getApprovedPlanId();
	if (!approvedPlanId) {
		throw new Error("No approved plan available. Call propose_actions and wait for approval.");
	}
	if (approvedPlanId !== planId) {
		throw new Error(
			`planId "${planId}" is not approved. Current approved planId is "${approvedPlanId}".`
		);
	}
}

export function createGitAgentTools(
	projectId: string,
	helpers: AgentChatToolHelpers,
	planGate: PlanApprovalGate
) {
	const { runTool } = helpers;

	const runWriteTool = async <T>(
		toolName: string,
		planId: string,
		ctx: { toolCallId?: string },
		run: () => Promise<T>
	): Promise<T> => {
		return runTool(toolName, ctx, async () => {
			assertApprovedPlan(planId, planGate);
			return run();
		});
	};

	return {
		get_status: tool({
			description:
				"Get current repository status including branch plus staged, unstaged, and untracked files",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("get_status", ctx, async () => {
					const status = await window.gitagen.repo.getStatus(projectId);
					return (
						status ?? {
							headOid: "",
							branch: "",
							staged: [],
							unstaged: [],
							untracked: [],
						}
					);
				}),
		}),

		get_all_diffs: tool({
			description: "Get diffs for all changed files",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("get_all_diffs", ctx, async () => {
					return await window.gitagen.repo.getAllDiffs(projectId);
				}),
		}),

		get_file_diff: tool({
			description: "Get diff for a specific file and scope",
			inputSchema: z.object({
				filePath: z.string(),
				scope: z.enum(["staged", "unstaged", "untracked"]),
			}),
			execute: async ({ filePath, scope }, ctx) =>
				runTool("get_file_diff", ctx, async () => {
					return (await window.gitagen.repo.getPatch(projectId, filePath, scope)) ?? "";
				}),
		}),

		get_log: tool({
			description: "Get recent commit history",
			inputSchema: z.object({
				limit: z.number().int().positive().max(100).optional(),
			}),
			execute: async ({ limit }, ctx) =>
				runTool("get_log", ctx, async () => {
					return await window.gitagen.repo.getLog(projectId, { limit: limit ?? 20 });
				}),
		}),

		list_branches: tool({
			description: "List local branches and tracking/ahead/behind info",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("list_branches", ctx, async () => {
					return await window.gitagen.repo.listBranches(projectId);
				}),
		}),

		list_remotes: tool({
			description: "List configured remotes",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("list_remotes", ctx, async () => {
					return await window.gitagen.repo.listRemotes(projectId);
				}),
		}),

		list_stash: tool({
			description: "List stash entries",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("list_stash", ctx, async () => {
					return await window.gitagen.repo.stashList(projectId);
				}),
		}),

		list_tags: tool({
			description: "List git tags in the repository",
			inputSchema: z.object({}),
			execute: async (_, ctx) =>
				runTool("list_tags", ctx, async () => {
					return await window.gitagen.repo.listTags(projectId);
				}),
		}),

		stage_files: tool({
			description: "Stage specific files",
			inputSchema: z.object({
				planId: z.string(),
				paths: z.array(z.string()).min(1),
			}),
			execute: async ({ planId, paths }, ctx) =>
				runWriteTool("stage_files", planId, ctx, async () => {
					await window.gitagen.repo.stageFiles(projectId, paths);
					return { success: true, staged: paths };
				}),
		}),

		unstage_files: tool({
			description: "Unstage specific files",
			inputSchema: z.object({
				planId: z.string(),
				paths: z.array(z.string()).min(1),
			}),
			execute: async ({ planId, paths }, ctx) =>
				runWriteTool("unstage_files", planId, ctx, async () => {
					await window.gitagen.repo.unstageFiles(projectId, paths);
					return { success: true, unstaged: paths };
				}),
		}),

		stage_all: tool({
			description: "Stage all changed files",
			inputSchema: z.object({
				planId: z.string(),
			}),
			execute: async ({ planId }, ctx) =>
				runWriteTool("stage_all", planId, ctx, async () => {
					await window.gitagen.repo.stageAll(projectId);
					return { success: true };
				}),
		}),

		unstage_all: tool({
			description: "Unstage all staged files",
			inputSchema: z.object({
				planId: z.string(),
			}),
			execute: async ({ planId }, ctx) =>
				runWriteTool("unstage_all", planId, ctx, async () => {
					await window.gitagen.repo.unstageAll(projectId);
					return { success: true };
				}),
		}),

		create_commit: tool({
			description: "Create a git commit from current staged files",
			inputSchema: z.object({
				planId: z.string(),
				message: z.string().min(1),
				amend: z.boolean().optional(),
			}),
			execute: async ({ planId, message, amend }, ctx) =>
				runWriteTool("create_commit", planId, ctx, async () => {
					return await window.gitagen.repo.commit(projectId, message, { amend });
				}),
		}),

		stash_create: tool({
			description: "Create a stash entry",
			inputSchema: z.object({
				planId: z.string(),
				message: z.string().optional(),
				includeUntracked: z.boolean().optional(),
			}),
			execute: async ({ planId, message, includeUntracked }, ctx) =>
				runWriteTool("stash_create", planId, ctx, async () => {
					await window.gitagen.repo.stash(projectId, {
						message,
						includeUntracked,
					});
					return { success: true };
				}),
		}),

		stash_apply: tool({
			description: "Apply a stash entry",
			inputSchema: z.object({
				planId: z.string(),
				index: z.number().int().min(0).optional(),
			}),
			execute: async ({ planId, index }, ctx) =>
				runWriteTool("stash_apply", planId, ctx, async () => {
					await window.gitagen.repo.stashApply(projectId, index);
					return { success: true, index };
				}),
		}),

		stash_pop: tool({
			description: "Pop a stash entry",
			inputSchema: z.object({
				planId: z.string(),
				index: z.number().int().min(0).optional(),
			}),
			execute: async ({ planId, index }, ctx) =>
				runWriteTool("stash_pop", planId, ctx, async () => {
					await window.gitagen.repo.stashPop(projectId, index);
					return { success: true, index };
				}),
		}),

		fetch: tool({
			description: "Fetch from remote",
			inputSchema: z.object({
				planId: z.string(),
				remote: z.string().optional(),
				prune: z.boolean().optional(),
			}),
			execute: async ({ planId, remote, prune }, ctx) =>
				runWriteTool("fetch", planId, ctx, async () => {
					return await window.gitagen.repo.fetch(projectId, { remote, prune });
				}),
		}),

		pull: tool({
			description: "Pull from remote",
			inputSchema: z.object({
				planId: z.string(),
				remote: z.string().optional(),
				branch: z.string().optional(),
				rebase: z.boolean().optional(),
			}),
			execute: async ({ planId, remote, branch, rebase }, ctx) =>
				runWriteTool("pull", planId, ctx, async () => {
					return await window.gitagen.repo.pull(projectId, { remote, branch, rebase });
				}),
		}),

		push: tool({
			description: "Push to remote",
			inputSchema: z.object({
				planId: z.string(),
				remote: z.string().optional(),
				branch: z.string().optional(),
				setUpstream: z.boolean().optional(),
			}),
			execute: async ({ planId, remote, branch, setUpstream }, ctx) =>
				runWriteTool("push", planId, ctx, async () => {
					return await window.gitagen.repo.push(projectId, {
						remote,
						branch,
						setUpstream,
					});
				}),
		}),

		switch_branch: tool({
			description: "Switch to another branch",
			inputSchema: z.object({
				planId: z.string(),
				name: z.string(),
			}),
			execute: async ({ planId, name }, ctx) =>
				runWriteTool("switch_branch", planId, ctx, async () => {
					await window.gitagen.repo.switchBranch(projectId, name);
					return { success: true, branch: name };
				}),
		}),

		create_branch: tool({
			description: "Create a new branch",
			inputSchema: z.object({
				planId: z.string(),
				name: z.string(),
				startPoint: z.string().optional(),
			}),
			execute: async ({ planId, name, startPoint }, ctx) =>
				runWriteTool("create_branch", planId, ctx, async () => {
					await window.gitagen.repo.createBranch(projectId, name, startPoint);
					return { success: true, branch: name, startPoint: startPoint ?? null };
				}),
		}),

		create_tag: tool({
			description: "Create a git tag at a commit or ref",
			inputSchema: z.object({
				planId: z.string(),
				name: z.string(),
				message: z.string().optional(),
				ref: z.string().optional(),
			}),
			execute: async ({ planId, name, message, ref }, ctx) =>
				runWriteTool("create_tag", planId, ctx, async () => {
					await window.gitagen.repo.createTag(projectId, name, {
						message,
						ref,
					});
					return { success: true, tag: name, ref: ref ?? "HEAD" };
				}),
		}),

		delete_tag: tool({
			description: "Delete a git tag",
			inputSchema: z.object({
				planId: z.string(),
				name: z.string(),
			}),
			execute: async ({ planId, name }, ctx) =>
				runWriteTool("delete_tag", planId, ctx, async () => {
					await window.gitagen.repo.deleteTag(projectId, name);
					return { success: true, deleted: name };
				}),
		}),

		push_tag: tool({
			description: "Push one or more tags to the remote",
			inputSchema: z.object({
				planId: z.string(),
				tags: z.array(z.string()).min(1),
				remote: z.string().optional(),
			}),
			execute: async ({ planId, tags, remote }, ctx) =>
				runWriteTool("push_tag", planId, ctx, async () => {
					const result = await window.gitagen.repo.pushTags(projectId, {
						tags,
						remote,
					});
					return {
						success: true,
						tagsPushed: result.tagsPushed,
						tags: tags,
					};
				}),
		}),

		propose_actions: {
			description:
				"Present an action plan and wait for approval before any mutating tool call. Always call this before writes.",
			inputSchema: z.object({
				planId: z.string(),
				summary: z.string(),
				actions: z.array(
					z.object({
						id: z.string().optional(),
						type: z.enum(["read", "write"]).optional(),
						tool: z.string(),
						args: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
						reasoning: z.string().optional(),
					})
				),
			}),
			outputSchema: z.object({
				decision: z.enum(["approved", "revise"]),
				planId: z.string(),
				feedback: z.string().optional(),
			}),
		},
	};
}
