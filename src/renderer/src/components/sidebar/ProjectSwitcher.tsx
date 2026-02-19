import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { Project } from "../../../../shared/types";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface ProjectSwitcherProps {
	projects: Project[];
	activeProject: Project;
	onProjectChange: (project: Project) => void;
	onAddProject?: () => void;
}

export function ProjectSwitcher({
	projects,
	activeProject,
	onProjectChange,
	onAddProject,
}: ProjectSwitcherProps) {
	const [open, setOpen] = useState(false);

	return (
		<div className="relative shrink-0 border-b border-(--border-secondary) px-3 py-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-(--bg-hover)"
					>
						<span className="truncate font-medium text-(--text-primary)">
							{activeProject.name}
						</span>
						<ChevronDown
							size={14}
							className={`ml-auto shrink-0 text-(--text-muted) transition-transform ${open ? "rotate-180" : ""}`}
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="max-h-64 w-(--radix-popover-trigger-width) overflow-auto"
				>
					{projects.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => {
								onProjectChange(p);
								setOpen(false);
							}}
							className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-(--bg-hover) ${
								activeProject.id === p.id ? "bg-(--bg-active)" : ""
							}`}
						>
							<span className="truncate font-medium text-(--text-primary)">
								{p.name}
							</span>
							<span className="truncate font-mono text-[10px] text-(--text-muted)">
								{p.path}
							</span>
						</button>
					))}
					{onAddProject && (
						<button
							type="button"
							onClick={() => {
								onAddProject();
								setOpen(false);
							}}
							className="flex w-full items-center gap-2 border-t border-(--border-secondary) px-3 py-2.5 text-sm text-(--text-secondary) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
						>
							<Plus size={14} />
							Add repository
						</button>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
