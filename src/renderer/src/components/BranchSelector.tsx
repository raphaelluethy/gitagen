import { useState, useEffect, useCallback } from "react";
import { GitBranch, ChevronDown, Check } from "lucide-react";
import type { BranchInfo } from "../../../shared/types";
import { useToast } from "../toast/provider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface BranchSelectorProps {
	projectId: string;
	currentBranch: string;
	onBranchChange: () => void;
}

export default function BranchSelector({
	projectId,
	currentBranch,
	onBranchChange,
}: BranchSelectorProps) {
	const [branches, setBranches] = useState<BranchInfo[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const { toast } = useToast();

	useEffect(() => {
		let cancelled = false;
		window.gitagen.repo.listBranches(projectId).then((branches) => {
			if (!cancelled) setBranches(branches);
		});
		return () => {
			cancelled = true;
		};
	}, [projectId, currentBranch]);

	const handleSwitch = useCallback(
		async (name: string) => {
			if (name === currentBranch) {
				setOpen(false);
				return;
			}
			setLoading(true);
			try {
				await window.gitagen.repo.switchBranch(projectId, name);
				onBranchChange();
				setOpen(false);
				toast.success("Switched to branch", name);
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				toast.error("Branch switch failed", msg);
			} finally {
				setLoading(false);
			}
		},
		[projectId, currentBranch, onBranchChange, toast]
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-(--text-secondary) outline-none transition-all hover:bg-(--bg-hover) hover:text-(--text-primary)"
					title="Switch branch"
				>
					<GitBranch size={14} className="text-(--text-primary)" />
					<code className="max-w-[140px] truncate font-mono">
						{currentBranch || "detached"}
					</code>
					<ChevronDown
						size={12}
						className={`shrink-0 text-(--text-muted) transition-transform duration-150 ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent className="max-h-72 w-72 overflow-auto" align="start">
				<div className="border-b border-(--border-secondary) px-4 py-2">
					<p className="section-title">Branches</p>
				</div>
				{branches.map((b) => (
					<button
						key={b.name}
						type="button"
						onClick={() => {
							void handleSwitch(b.name);
						}}
						disabled={loading}
						className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] outline-none transition-colors ${
							b.current
								? "bg-(--bg-active) font-medium text-(--text-primary)"
								: "hover:bg-(--bg-hover)"
						}`}
					>
						<span
							className={`w-4 shrink-0 ${b.current ? "text-(--text-primary)" : "invisible"}`}
						>
							<Check size={14} />
						</span>
						<code
							className={`flex-1 truncate font-mono text-xs ${
								b.current
									? "font-medium text-(--text-primary)"
									: "text-(--text-secondary)"
							}`}
						>
							{b.name}
						</code>
						{b.ahead > 0 && (
							<span className="shrink-0 rounded bg-(--success-bg) px-1.5 py-0.5 font-mono text-[10px] font-medium text-(--success)">
								+{b.ahead}
							</span>
						)}
						{b.behind > 0 && (
							<span className="shrink-0 rounded bg-(--warning-bg) px-1.5 py-0.5 font-mono text-[10px] font-medium text-(--warning)">
								-{b.behind}
							</span>
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
