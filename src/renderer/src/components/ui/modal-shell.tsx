import type React from "react";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { cn } from "../../lib/cn";

interface ModalShellProps {
	title: string;
	description?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	className?: string;
	bodyClassName?: string;
}

export function ModalShell({
	title,
	description,
	children,
	footer,
	className,
	bodyClassName,
}: ModalShellProps) {
	return (
		<div className={cn("flex max-h-[85vh] flex-col", className)}>
			<DialogHeader className="border-b border-(--border-secondary) px-5 py-4 pr-11">
				<DialogTitle>{title}</DialogTitle>
				{description ? <DialogDescription>{description}</DialogDescription> : null}
			</DialogHeader>
			<div className={cn("min-h-0 flex-1 overflow-auto px-5 py-4", bodyClassName)}>
				{children}
			</div>
			{footer ? (
				<DialogFooter className="border-t border-(--border-secondary) px-5 py-3">
					{footer}
				</DialogFooter>
			) : null}
		</div>
	);
}
