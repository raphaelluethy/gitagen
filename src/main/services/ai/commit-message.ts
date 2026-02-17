import type { WebContents } from "electron";
import simpleGit from "simple-git";
import { getProject, getProjectPrefs } from "../cache/queries.js";
import { getAppSettings, getAppSettingsWithKeys } from "../settings/store.js";
import { createAIProvider, getProviderInfo } from "./index.js";
import { buildMessages } from "./prompts.js";
import type { CommitStyle } from "../../../shared/types.js";

const AI_COMMIT_CHUNK = "ai:commitChunk";

async function getRepoPath(projectId: string): Promise<string | null> {
	const project = await getProject(projectId);
	if (!project) return null;
	const prefs = await getProjectPrefs(projectId);
	const activePath = prefs?.active_worktree_path;
	return activePath && activePath.trim() !== "" ? activePath : project.path;
}

async function createGit(cwd: string) {
	const settings = await getAppSettings();
	const opts: { baseDir: string; binary?: string } = { baseDir: cwd };
	if (settings.gitBinaryPath) opts.binary = settings.gitBinaryPath;
	return simpleGit(opts);
}

async function getDiff(cwd: string): Promise<string> {
	const git = await createGit(cwd);
	const status = await git.status();

	// Check for staged, unstaged, and untracked files
	const hasStaged = status.files.some((f) => f.index !== " " && f.index !== "?");
	const hasUnstaged = status.files.some((f) => f.working_dir !== " " && f.working_dir !== "?");
	const hasUntracked = status.not_added.length > 0;

	// If only untracked files exist, throw an error
	if (!hasStaged && !hasUnstaged && hasUntracked) {
		throw new Error(
			"Only untracked files found. Stage files first before generating a commit message."
		);
	}

	// If nothing is staged but there are unstaged files, stage them
	if (!hasStaged && hasUnstaged) {
		const unstagedPaths = status.files
			.filter((f) => f.working_dir !== " " && f.working_dir !== "?")
			.map((f) => f.path);
		if (unstagedPaths.length > 0) {
			await git.add(unstagedPaths);
		}
	}

	return (await git.diff(["--cached"])) || "";
}

export async function generateCommitMessage(
	projectId: string,
	webContents: WebContents
): Promise<string> {
	const repoPath = await getRepoPath(projectId);
	if (!repoPath) throw new Error("Project not found");

	const settings = await getAppSettingsWithKeys();
	const { activeProviderId, providers, commitStyle } = settings.ai;

	if (!activeProviderId) throw new Error("No AI provider configured. Add one in Settings.");
	const providerInstance = providers.find((p) => p.id === activeProviderId);
	if (!providerInstance) throw new Error("AI provider not found. Reconfigure in Settings.");
	if (!providerInstance.apiKey?.trim()) {
		throw new Error("AI provider missing API key. Add it in Settings.");
	}
	if (!providerInstance.defaultModel?.trim()) {
		throw new Error("No model selected. Select a model for your AI provider in Settings.");
	}

	const providerInfo = getProviderInfo(providerInstance.type);
	if (providerInfo?.requiresBaseURL && !providerInstance.baseURL?.trim()) {
		throw new Error("AI provider requires a Base URL. Configure it in Settings.");
	}

	const diff = await getDiff(repoPath);
	if (!diff.trim()) throw new Error("No changes to describe");

	const provider = createAIProvider(providerInstance.type, {
		apiKey: providerInstance.apiKey,
		baseURL: providerInstance.baseURL,
		model: providerInstance.defaultModel,
	});

	const messages = buildMessages(diff, commitStyle as CommitStyle);

	const result = await provider.streamChat(messages, {
		maxTokens: 200,
		onChunk: (chunk) => {
			webContents.send(AI_COMMIT_CHUNK, chunk);
		},
	});

	return result.content.trim();
}
