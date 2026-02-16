import { useEffect, useState } from "react";
import GitAgentModal from "./GitAgentModal";
import { buildGitAgentSystemPrompt } from "../lib/git-agent-prompt";
import type { CommitStyle } from "../../../shared/types";

interface AutoCommitModalProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
}

const AUTO_COMMIT_INITIAL_PROMPT =
	"Analyze all changes and use propose_actions to present a commit plan. Group related changes together into cohesive commits. Show the commit preview cards, do not describe them in text.";

/**
 * Auto-commit entrypoint that loads commit style from settings and uses
 * a customized system prompt for commit-focused workflows.
 */
export default function AutoCommitModal(props: AutoCommitModalProps) {
	const [commitStyle, setCommitStyle] = useState<CommitStyle>("conventional");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!props.open) {
			setLoading(true);
			return;
		}

		window.gitagen.settings
			.getGlobalWithKeys()
			.then((settings) => {
				setCommitStyle(settings.ai.commitStyle ?? "conventional");
				setLoading(false);
			})
			.catch(() => {
				setLoading(false);
			});
	}, [props.open]);

	if (loading) return null;

	const systemPrompt = buildGitAgentSystemPrompt(commitStyle);

	return (
		<GitAgentModal
			{...props}
			initialPrompt={AUTO_COMMIT_INITIAL_PROMPT}
			systemPrompt={systemPrompt}
		/>
	);
}
