import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

interface ContextMenuProps {
	children: React.ReactNode;
	onOpenChange?: (open: boolean) => void;
}

interface Position {
	x: number;
	y: number;
}

const ContextMenuContext = React.createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
	position: Position;
	setPosition: (pos: Position) => void;
} | null>(null);

function useContextMenu() {
	const ctx = React.useContext(ContextMenuContext);
	if (!ctx) throw new Error("useContextMenu must be used within ContextMenu");
	return ctx;
}

function ContextMenu({ children, onOpenChange }: ContextMenuProps) {
	const [open, setOpenState] = React.useState(false);
	const [position, setPosition] = React.useState({ x: 0, y: 0 });

	const setOpen = React.useCallback(
		(value: boolean) => {
			setOpenState(value);
			onOpenChange?.(value);
		},
		[onOpenChange]
	);

	return (
		<ContextMenuContext.Provider value={{ open, setOpen, position, setPosition }}>
			{children}
		</ContextMenuContext.Provider>
	);
}

function ContextMenuTrigger({ children }: { children: React.ReactNode }) {
	const { setOpen, setPosition } = useContextMenu();

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setPosition({ x: e.clientX, y: e.clientY });
		setOpen(true);
	};

	return React.cloneElement(
		children as React.ReactElement<{ onContextMenu?: (e: React.MouseEvent) => void }>,
		{
			onContextMenu: handleContextMenu,
		}
	);
}

interface ContextMenuContentProps {
	children: React.ReactNode;
	className?: string;
}

function ContextMenuContent({ children, className }: ContextMenuContentProps) {
	const { open, setOpen, position } = useContextMenu();
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

	React.useEffect(() => {
		if (open && ref.current) {
			const rect = ref.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let x = position.x;
			let y = position.y;

			if (x + rect.width > viewportWidth) {
				x = viewportWidth - rect.width - 8;
			}
			if (y + rect.height > viewportHeight) {
				y = viewportHeight - rect.height - 8;
			}

			ref.current.style.left = `${x}px`;
			ref.current.style.top = `${y}px`;
		}
	}, [open, position]);

	if (!open) return null;

	return createPortal(
		<div
			ref={ref}
			className={cn(
				"dropdown overlay-popover animate-scale-in fixed z-[9999] min-w-[160px] p-1 outline-none",
				className
			)}
			style={{ left: position.x, top: position.y }}
		>
			{children}
		</div>,
		document.body
	);
}

interface ContextMenuItemProps {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	variant?: "default" | "destructive";
	className?: string;
}

function ContextMenuItem({
	children,
	onClick,
	disabled,
	variant = "default",
	className,
}: ContextMenuItemProps) {
	const { setOpen } = useContextMenu();

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

function ContextMenuSeparator({ className }: { className?: string }) {
	return <div className={cn("my-1 h-px bg-(--border-secondary)", className)} />;
}

export {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
};
