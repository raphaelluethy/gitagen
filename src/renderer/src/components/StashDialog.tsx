import { useState } from "react";
import { Archive } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";
import { useToast } from "../toast/provider";

interface StashDialogProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
	onStashCreated: () => void;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

export default function StashDialog({
	open,
	onClose,
	projectId,
	onStashCreated,
}: StashDialogProps) {
	const [message, setMessage] = useState("");
	const [includeUntracked, setIncludeUntracked] = useState(true);
	const [loading, setLoading] = useState(false);
	const { toast } = useToast();

	const handleStash = async () => {
		setLoading(true);
		try {
			await window.gitagen.repo.stash(projectId, {
				message: message.trim() || undefined,
				includeUntracked,
			});
			toast.success("Stash created");
			onStashCreated();
			onClose();
			setMessage("");
			setIncludeUntracked(true);
		} catch (error) {
			toast.error("Failed to create stash", getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent size="sm" className="p-0">
				<ModalShell
					title="Create Stash"
					description="Save your changes to the stash for later use."
				>
					<div className="space-y-3">
						<div>
							<label
								htmlFor="stash-message"
								className="mb-1 block text-xs font-medium text-(--text-secondary)"
							>
								Message (optional)
							</label>
							<input
								id="stash-message"
								type="text"
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								placeholder="Describe this stash..."
								className="input w-full text-xs"
							/>
						</div>
						<label className="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={includeUntracked}
								onChange={(e) => setIncludeUntracked(e.target.checked)}
								className="h-4 w-4 rounded border-(--border-primary)"
							/>
							<span className="text-xs text-(--text-secondary)">
								Include untracked files
							</span>
						</label>
						<div className="flex gap-2 pt-2">
							<button
								type="button"
								onClick={handleStash}
								disabled={loading}
								className="btn btn-primary flex-1 text-xs"
							>
								<Archive size={14} />
								{loading ? "Stashing..." : "Stash"}
							</button>
							<button
								type="button"
								onClick={onClose}
								disabled={loading}
								className="btn btn-secondary flex-1 text-xs"
							>
								Cancel
							</button>
						</div>
					</div>
				</ModalShell>
			</DialogContent>
		</Dialog>
	);
}
