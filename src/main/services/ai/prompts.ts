import dedent from "dedent";
import type { CommitStyle } from "../../../shared/types.js";
import type { ChatMessage } from "./types.js";

const MAX_DIFF_CHARS = 8000;

function truncateDiff(diff: string): string {
	if (diff.length <= MAX_DIFF_CHARS) return diff;
	return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated for length]";
}

const SYSTEM_PROMPTS: Record<CommitStyle, string> = {
	conventional: dedent`
		You generate git commit messages from staged diffs. Use Conventional Commits: type(scope): description.
		Types: feat, fix, docs, style, refactor, test, chore. Output only the message, no quotes or extra text.
	`,
	emoji: dedent`
		You generate git commit messages from staged diffs. Use Gitmoji style: emoji description (e.g. feat:, fix:, docs:).
		Use emojis like :sparkles: :bug: :recycle: :memo: :lipstick: :wrench:. Output only the message, no extra text.
	`,
	descriptive: dedent`
		You generate git commit messages from staged diffs. Use plain English, clear and descriptive.
		Describe what changed and why. Output only the message, no quotes or extra text.
	`,
	imperative: dedent`
		You generate git commit messages from staged diffs. Use short imperative mood: "Add X", "Fix Y", "Remove Z".
		First line under 72 chars. Output only the message, no quotes or extra text.
	`,
};

export function buildMessages(diff: string, style: CommitStyle): ChatMessage[] {
	const truncated = truncateDiff(diff);
	return [
		{ role: "system", content: SYSTEM_PROMPTS[style] },
		{ role: "user", content: `Staged diff:\n\n${truncated}` },
	];
}
