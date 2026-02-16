import * as React from "react";
import { cn } from "../../lib/cn";

interface DropdownMenuContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu() {
	const ctx = React.useContext(DropdownMenuContext);
	if (!ctx) throw new Error("useDropdownMenu must be used within DropdownMenu");
	return ctx;
}

interface DropdownMenuProps {
	children: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
	const [internalOpen, setInternalOpen] = React.useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = (value: boolean) => {
		setInternalOpen(value);
		onOpenChange?.(value);
	};

	return (
		<DropdownMenuContext.Provider value={{ open, setOpen }}>
			<div className="relative inline-block">{children}</div>
		</DropdownMenuContext.Provider>
	);
}

function DropdownMenuTrigger({
	children,
	asChild,
	className,
}: {
	children: React.ReactNode;
	asChild?: boolean;
	className?: string;
}) {
	const { open, setOpen } = useDropdownMenu();
	const ref = React.useRef<HTMLButtonElement>(null);

	if (asChild && React.isValidElement(children)) {
		return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
			onClick: () => setOpen(!open),
		});
	}

	return (
		<button ref={ref} type="button" onClick={() => setOpen(!open)} className={className}>
			{children}
		</button>
	);
}

interface DropdownMenuContentProps {
	children: React.ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
	sideOffset?: number;
}

function DropdownMenuContent({ children, className, align = "start" }: DropdownMenuContentProps) {
	const { open, setOpen } = useDropdownMenu();
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function handleEscape(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open, setOpen]);

	if (!open) return null;

	const alignClass =
		align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";

	return (
		<div
			ref={ref}
			className={cn(
				"dropdown overlay-popover animate-scale-in absolute top-full z-50 mt-1 min-w-[160px] p-1 outline-none",
				alignClass,
				className
			)}
		>
			{children}
		</div>
	);
}

interface DropdownMenuItemProps {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	variant?: "default" | "destructive";
	className?: string;
}

function DropdownMenuItem({
	children,
	onClick,
	disabled,
	variant = "default",
	className,
}: DropdownMenuItemProps) {
	const { setOpen } = useDropdownMenu();

	const handleClick = () => {
		if (disabled) return;
		onClick?.();
		setOpen(false);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={disabled}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] outline-none transition-colors",
				"disabled:cursor-not-allowed disabled:opacity-50",
				variant === "destructive"
					? "text-(--danger) hover:bg-(--danger)/10 focus:bg-(--danger)/10"
					: "text-(--text-primary) hover:bg-(--bg-hover) focus:bg-(--bg-hover)",
				className
			)}
		>
			{children}
		</button>
	);
}

function DropdownMenuSeparator({ className }: { className?: string }) {
	return <div className={cn("my-1 h-px bg-(--border-secondary)", className)} />;
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
};
