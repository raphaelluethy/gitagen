import GitAgentModal from "./GitAgentModal";

interface AutoCommitModalProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
}

/**
 * Backward-compatible wrapper.
 * Auto-commit entrypoints now route to the unified GitAgent modal.
 */
export default function AutoCommitModal(props: AutoCommitModalProps) {
	return <GitAgentModal {...props} />;
}
