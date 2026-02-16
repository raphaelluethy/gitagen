import { useState, useEffect, useCallback, useRef } from "react";
import { GitBranchPlus, Trash2, Check, ChevronDown } from "lucide-react";
import type { AddWorktreeResult, BranchInfo, WorktreeInfo } from "../../../shared/types";
import { useToast } from "../toast/provider";
import { Dialog, DialogContent } from "./ui/dialog";
import { ModalShell } from "./ui/modal-shell";

const DRAG_HEIGHT_KEY = "gitagen:worktreePanel:height";

interface WorktreePanelProps {
	projectId: string;
	projectName: string;
	projectPath: string;
	currentBranch: string;
	activeWorktreePath: string | null;
	onRefresh: () => void;
	isCollapsed?: boolean;
	onToggle?: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim() !== "") {
		return error.message;
	}
	return fallback;
}

function readStoredHeight(): number | null {
	try {
		const raw = localStorage.getItem(DRAG_HEIGHT_KEY);
		if (raw) {
			const v = parseInt(raw, 10);
			if (Number.isFinite(v) && v > 0) return v;
		}
	} catch {
		// ignore
	}
	return null;
}

export default function WorktreePanel({
	projectId,
	projectName: _projectName,
	projectPath: _projectPath,
	currentBranch,
	activeWorktreePath,
	onRefresh,
	isCollapsed,
	onToggle,
}: WorktreePanelProps) {
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [showAddForm, setShowAddForm] = useState(false);
	const [addBranch, setAddBranch] = useState("");
	const [copyGitIgnores, setCopyGitIgnores] = useState(false);
	const [pruning, setPruning] = useState(false);
	const [removingPath, setRemovingPath] = useState<string | null>(null);
	const [dragHeight, setDragHeight] = useState<number | null>(readStoredHeight);
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const { toast } = useToast();

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const startY = e.clientY;
		const container = containerRef.current;
		if (!container) return;
		const startHeight = container.getBoundingClientRect().height;
		setIsDragging(true);

		const onMouseMove = (ev: MouseEvent) => {
			const delta = startY - ev.clientY;
			const next = Math.max(40, Math.round(startHeight + delta));
			setDragHeight(next);
		};
		const onMouseUp = () => {
			setIsDragging(false);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			const container = containerRef.current;
			if (container) {
				const h = Math.round(container.getBoundingClientRect().height);
				try {
					localStorage.setItem(DRAG_HEIGHT_KEY, String(h));
				} catch {
					// ignore
				}
			}
		};
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}, []);

	const handleDragReset = useCallback(() => {
		setDragHeight(null);
		try {
			localStorage.removeItem(DRAG_HEIGHT_KEY);
		} catch {
			// ignore
		}
	}, []);

	const isModifiedWorktreeError = (error: unknown): boolean => {
		const message = getErrorMessage(error, "").toLowerCase();
		return (
			message.includes("contains modified or untracked files") ||
			message.includes("contains local changes") ||
			message.includes("use --force")
		);
	};

	const isBranchAlreadyCheckedOutError = (error: unknown): boolean => {
		const message = getErrorMessage(error, "").toLowerCase();
		return (
			message.includes("already checked out at") || message.includes("is already checked out")
		);
	};

	const suggestWorktreeBranchName = (
		baseBranch: string,
		existingBranches: Set<string>
	): string => {
		let candidate = `${baseBranch}-worktree`;
		let suffix = 2;
		while (existingBranches.has(candidate)) {
			candidate = `${baseBranch}-worktree-${suffix}`;
			suffix += 1;
		}
		return candidate;
	};

	const getWorktreeName = (path: string): string => {
		return worktrees.find((w) => w.path === path)?.name ?? path.split("/").pop() ?? path;
	};

	const loadWorktrees = useCallback(async () => {
		setLoading(true);
		try {
			const next = await window.gitagen.repo.listWorktrees(projectId);
			setWorktrees(next);
		} catch (error) {
			toast.error("Failed to load worktrees", getErrorMessage(error, "Unknown error."));
		} finally {
			setLoading(false);
		}
	}, [projectId, toast]);

	useEffect(() => {
		void loadWorktrees();
	}, [loadWorktrees, onRefresh]);

	const openAddForm = () => {
		const defaultBranch = currentBranch || "main";
		setAddBranch(defaultBranch);
		setCopyGitIgnores(false);
		setShowAddForm(true);
	};

	const handleAdd = async () => {
		const requestedBranch = addBranch.trim();
		if (!requestedBranch) {
			toast.info("Enter a branch name");
			return;
		}
		setAdding(true);
		try {
			const branches: BranchInfo[] = await window.gitagen.repo.listBranches(projectId);
			const existingBranchNames = new Set(branches.map((b) => b.name));
			const currentLocalBranch =
				currentBranch || branches.find((b) => b.current)?.name || "HEAD";
			let baseBranch = requestedBranch;
			let newBranch: string | undefined;

			if (!existingBranchNames.has(requestedBranch)) {
				const shouldCreate = await window.gitagen.app.confirm({
					title: "Create Branch",
					message: `Branch "${requestedBranch}" does not exist.`,
					detail: `Create it from "${currentLocalBranch}" and use it in the new worktree?`,
					confirmLabel: "Create Branch",
					cancelLabel: "Cancel",
				});
				if (!shouldCreate) {
					return;
				}
				baseBranch = currentLocalBranch;
				newBranch = requestedBranch;
			}

			let result: AddWorktreeResult;
			try {
				result = await window.gitagen.repo.addWorktree(projectId, baseBranch, {
					newBranch,
					copyGitIgnores,
				});
			} catch (error) {
				if (!newBranch && isBranchAlreadyCheckedOutError(error)) {
					const suggested = suggestWorktreeBranchName(
						requestedBranch,
						existingBranchNames
					);
					const shouldUseSuggested = await window.gitagen.app.confirm({
						title: "Branch Already Checked Out",
						message: `Branch "${requestedBranch}" is already checked out in another worktree.`,
						detail: `Create a new branch "${suggested}" from "${requestedBranch}" for this worktree?`,
						confirmLabel: "Use Suggested Branch",
						cancelLabel: "Cancel",
					});
					if (!shouldUseSuggested) {
						return;
					}
					result = await window.gitagen.repo.addWorktree(projectId, requestedBranch, {
						newBranch: suggested,
						copyGitIgnores,
					});
					newBranch = suggested;
				} else {
					throw error;
				}
			}

			await loadWorktrees();
			onRefresh();
			setShowAddForm(false);
			const checkedOutBranch = newBranch ?? requestedBranch;
			if (copyGitIgnores) {
				if (result.copyGitignoreError) {
					toast.info(
						"Worktree created",
						`.gitignore copy failed: ${result.copyGitignoreError}`
					);
				} else {
					const count = result.copiedGitignoreCount;
					toast.success(
						"Worktree created",
						`Copied ${count} .gitignore file${count === 1 ? "" : "s"} into ${checkedOutBranch}`
					);
				}
			} else {
				toast.success("Worktree created", checkedOutBranch);
			}
		} catch (error) {
			toast.error("Failed to add worktree", getErrorMessage(error, "Unknown error."));
		} finally {
			setAdding(false);
		}
	};

	const handlePrune = async () => {
		const shouldPrune = await window.gitagen.app.confirm({
			title: "Clean Worktrees",
			message: "Clean up stale worktrees?",
			confirmLabel: "Clean",
			cancelLabel: "Cancel",
		});
		if (!shouldPrune) return;
		setPruning(true);
		try {
			await window.gitagen.repo.pruneWorktrees(projectId);
			await loadWorktrees();
			onRefresh();
			toast.success("Stale worktrees cleaned up");
		} catch (error) {
			toast.error("Failed to clean worktrees", getErrorMessage(error, "Unknown error."));
		} finally {
			setPruning(false);
		}
	};

	const handleRemove = async (path: string) => {
		const name = getWorktreeName(path);
		const shouldRemove = await window.gitagen.app.confirm({
			title: "Remove Worktree",
			message: `Remove worktree "${name}"?`,
			detail: path,
			confirmLabel: "Remove",
			cancelLabel: "Cancel",
		});
		if (!shouldRemove) return;
		setRemovingPath(path);
		try {
			await window.gitagen.repo.removeWorktree(projectId, path);
			setWorktrees((prev) => prev.filter((w) => w.path !== path));
			onRefresh();
			toast.success("Worktree removed");
		} catch (error) {
			if (isModifiedWorktreeError(error)) {
				const message = getErrorMessage(error, "Worktree contains local changes.");
				const shouldForce = await window.gitagen.app.confirm({
					title: "Force Remove Worktree",
					message: "Worktree contains local changes.",
					detail: `${message}\n\nForce removal will discard uncommitted changes.`,
					confirmLabel: "Force Remove",
					cancelLabel: "Cancel",
				});
				if (!shouldForce) {
					return;
				}
				try {
					await window.gitagen.repo.removeWorktree(projectId, path, true);
					setWorktrees((prev) => prev.filter((w) => w.path !== path));
					onRefresh();
					toast.success("Worktree removed", "Forced removal");
					return;
				} catch (forceError) {
					toast.error(
						"Failed to remove worktree",
						getErrorMessage(forceError, "Unknown error.")
					);
					return;
				}
			}

			toast.error("Failed to remove worktree", getErrorMessage(error, "Unknown error."));
		} finally {
			setRemovingPath(null);
		}
	};

	const addFormContent = (
		<DialogContent size="sm" className="p-0">
			<ModalShell
				title="Create worktree"
				description="Create a new worktree from an existing branch or create one from the current branch."
				bodyClassName="space-y-3"
				footer={
					<>
						<button
							type="button"
							onClick={() => setShowAddForm(false)}
							disabled={adding}
							className="btn btn-secondary"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => void handleAdd()}
							disabled={adding}
							className="btn btn-primary"
						>
							{adding ? "Creating..." : "Create"}
						</button>
					</>
				}
			>
				<div>
					<label className="mb-1 block text-xs font-medium text-(--text-muted)">
						Branch
					</label>
					<input
						type="text"
						value={addBranch}
						onChange={(e) => setAddBranch(e.target.value)}
						placeholder="feature/my-worktree"
						className="input h-9 text-xs"
						disabled={adding}
					/>
				</div>
				<label className="flex cursor-pointer items-center gap-2 text-[12px] text-(--text-secondary)">
					<input
						type="checkbox"
						checked={copyGitIgnores}
						onChange={(e) => setCopyGitIgnores(e.target.checked)}
						disabled={adding}
					/>
					Copy .gitignore files into the new worktree
				</label>
			</ModalShell>
		</DialogContent>
	);

	if (isCollapsed) {
		return (
			<Dialog
				open={showAddForm}
				onOpenChange={(nextOpen) => {
					if (!adding) setShowAddForm(nextOpen);
				}}
			>
				{addFormContent}
			</Dialog>
		);
	}

	const containerStyle: React.CSSProperties | undefined =
		dragHeight !== null ? { maxHeight: dragHeight } : undefined;

	return (
		<div
			ref={containerRef}
			className="flex shrink-0 flex-col border-t border-(--border-secondary)"
			style={containerStyle}
		>
			{/* Drag handle */}
			<div
				role="separator"
				aria-orientation="horizontal"
				onMouseDown={handleDragStart}
				onDoubleClick={handleDragReset}
				className={`worktree-drag-handle ${isDragging ? "active" : ""}`}
			/>
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between px-3 py-1.5">
				<button
					type="button"
					onClick={onToggle}
					className="flex items-center gap-1 text-left outline-none"
					title="Hide worktrees"
				>
					<ChevronDown
						size={12}
						className="shrink-0 text-(--text-muted) transition-transform duration-150"
					/>
					<span className="section-title">Worktrees</span>
				</button>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handlePrune}
						disabled={pruning}
						className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary) disabled:opacity-50"
						title="Clean up stale worktrees"
					>
						Clean
					</button>
					<button
						type="button"
						onClick={openAddForm}
						disabled={adding}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary) disabled:opacity-50"
						title="Add worktree"
					>
						<GitBranchPlus size={11} />
						Add
					</button>
				</div>
			</div>
			{/* Scrollable content area */}
			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{loading ? (
					<div className="px-1 py-1 text-xs text-(--text-muted)">
						Loading worktrees...
					</div>
				) : (
					<div className="space-y-0.5">
						{worktrees.map((w) => {
							const name = w.name ?? w.path.split("/").pop();
							const isActive =
								(activeWorktreePath && w.path === activeWorktreePath) ||
								(!activeWorktreePath && w.isMainWorktree);
							return (
								<div
									key={w.path}
									className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
										isActive ? "bg-(--bg-active)" : "hover:bg-(--bg-hover)"
									}`}
								>
									<span
										className={`shrink-0 ${isActive ? "text-(--text-muted)" : "invisible"}`}
									>
										<Check size={11} />
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-[11px] font-medium text-(--text-primary)">
											{name}
										</p>
										<p className="truncate text-[10px] text-(--text-subtle)">
											{w.branch}
										</p>
									</div>
									<div className="flex shrink-0 gap-0.5">
										{!isActive && (
											<button
												type="button"
												onClick={() => {
													window.gitagen.settings.setProjectPrefs(
														projectId,
														{
															activeWorktreePath: w.path,
														}
													);
													onRefresh();
												}}
												className="rounded px-1.5 py-0.5 text-[10px] text-(--text-muted) outline-none hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
											>
												Switch
											</button>
										)}
										{!w.isMainWorktree && (
											<button
												type="button"
												onClick={() => void handleRemove(w.path)}
												disabled={removingPath === w.path}
												className="rounded p-0.5 text-(--text-muted) outline-none hover:bg-(--danger-bg) hover:text-(--danger)"
												title="Remove worktree"
											>
												<Trash2 size={11} />
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<Dialog
				open={showAddForm}
				onOpenChange={(nextOpen) => {
					if (!adding) setShowAddForm(nextOpen);
				}}
			>
				{addFormContent}
			</Dialog>
		</div>
	);
}
