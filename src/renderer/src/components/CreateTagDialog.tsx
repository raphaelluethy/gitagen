import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";
import { useToast } from "../toast/provider";

interface CreateTagDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	commitOid: string;
	onTagCreated: () => void;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

export function CreateTagDialog({
	open,
	onOpenChange,
	projectId,
	commitOid,
	onTagCreated,
}: CreateTagDialogProps) {
	const [name, setName] = useState("");
	const [message, setMessage] = useState("");
	const [ref, setRef] = useState(commitOid);
	const [loading, setLoading] = useState(false);
	const { toast } = useToast();

	// Reset form when dialog opens with new commit
	useEffect(() => {
		if (open) {
			setRef(commitOid);
			setName("");
			setMessage("");
		}
	}, [open, commitOid]);

	const handleCreate = async () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Tag name required", "Enter a tag name.");
			return;
		}
		setLoading(true);
		try {
			await window.gitagen.repo.createTag(projectId, trimmedName, {
				message: message.trim() || undefined,
				ref: ref.trim() || undefined,
			});
			toast.success("Tag created", trimmedName);
			onTagCreated();
			onOpenChange(false);
		} catch (error) {
			toast.error("Failed to create tag", getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm" className="p-0">
				<ModalShell
					title="Create Tag"
					description="Create a new tag pointing at the selected commit."
				>
					<div className="space-y-3">
						<div>
							<label
								htmlFor="tag-name"
								className="mb-1 block text-xs font-medium text-(--text-secondary)"
							>
								Tag name
							</label>
							<input
								id="tag-name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. v1.0.0"
								className="input w-full text-xs"
								autoFocus
							/>
						</div>
						<div>
							<label
								htmlFor="tag-message"
								className="mb-1 block text-xs font-medium text-(--text-secondary)"
							>
								Message (optional, creates annotated tag)
							</label>
							<textarea
								id="tag-message"
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								placeholder="Tag annotation..."
								rows={2}
								className="input w-full resize-none text-xs"
							/>
						</div>
						<div>
							<label
								htmlFor="tag-ref"
								className="mb-1 block text-xs font-medium text-(--text-secondary)"
							>
								Commit (ref)
							</label>
							<input
								id="tag-ref"
								type="text"
								value={ref}
								onChange={(e) => setRef(e.target.value)}
								placeholder="Commit hash or ref"
								className="input w-full font-mono text-xs"
							/>
						</div>
					</div>
					<div className="mt-4 flex justify-end gap-2">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="btn btn-secondary text-xs"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleCreate}
							disabled={loading || !name.trim()}
							className="btn btn-primary text-xs disabled:opacity-50"
						>
							{loading ? "Creating…" : "Create Tag"}
						</button>
					</div>
				</ModalShell>
			</DialogContent>
		</Dialog>
	);
}
