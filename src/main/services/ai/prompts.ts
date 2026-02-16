import dedent from "dedent";
import type { CommitStyle } from "../../../shared/types.js";
import type { ChatMessage } from "./types.js";

const MAX_DIFF_CHARS = 8000;

function truncateDiff(diff: string): string {
	if (diff.length <= MAX_DIFF_CHARS) return diff;
	return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated for length]";
}

const SHARED_RULES = dedent`
	## Rules
	- Output ONLY the commit message. No quotes, backticks, or extra commentary.
	- Use imperative mood ("Add", "Fix", "Remove", not "Added", "Fixed", "Removed").
	- Focus on WHY the changes were made, not just what changed.
	- Subject line must be under 72 characters.
	- After the subject line, add a blank line and then a short body (1-3 lines) that describes the key changes and the motivation behind them.
	- Keep the body lines under 80 characters each.
	- Do NOT add co-author information or AI attribution.
	- Write the message as if the developer wrote it themselves.
`;

const SYSTEM_PROMPTS: Record<CommitStyle, string> = {
	conventional: dedent`
		You generate git commit messages from diffs. Use the Conventional Commits format for the subject line: type(scope): description.
		Types: feat, fix, docs, style, refactor, test, chore. Scope is optional but encouraged when clear.

		${SHARED_RULES}
	`,
	emoji: dedent`
		You generate git commit messages from diffs. Use Gitmoji style: start the subject line with a relevant emoji.
		Common emojis: ✨ (feat), 🐛 (fix), ♻️ (refactor), 📝 (docs), 💄 (style/UI), 🔧 (config), ✅ (tests), 🔥 (remove code).

		${SHARED_RULES}
	`,
	descriptive: dedent`
		You generate git commit messages from diffs. Use plain English, clear and descriptive.
		The subject line should concisely summarize the change.

		${SHARED_RULES}
	`,
	imperative: dedent`
		You generate git commit messages from diffs. Use short imperative mood for the subject: "Add X", "Fix Y", "Remove Z".

		${SHARED_RULES}
	`,
};

export function buildMessages(diff: string, style: CommitStyle): ChatMessage[] {
	const truncated = truncateDiff(diff);
	return [
		{ role: "system", content: SYSTEM_PROMPTS[style] },
		{ role: "user", content: `Write a commit message for this diff:\n\n${truncated}` },
	];
}
