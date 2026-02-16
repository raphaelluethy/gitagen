import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

const dialogContentVariants = cva("overlay-content animate-scale-in", {
	variants: {
		size: {
			sm: "overlay-content-sm",
			md: "overlay-content-md",
			lg: "overlay-content-lg",
			xl: "overlay-content-xl",
			full: "overlay-content-full",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn("overlay-backdrop animate-fade-in", className)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
	VariantProps<typeof dialogContentVariants> & {
		showCloseButton?: boolean;
		closeButtonLabel?: string;
		unstyled?: boolean;
		overlayClassName?: string;
	};

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	DialogContentProps
>(
	(
		{
			className,
			children,
			size,
			showCloseButton = true,
			closeButtonLabel = "Close",
			unstyled = false,
			overlayClassName,
			...props
		},
		ref
	) => (
		<DialogPortal>
			<DialogOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				ref={ref}
				className={unstyled ? className : cn(dialogContentVariants({ size }), className)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close
						className="absolute right-3 top-3 rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
						aria-label={closeButtonLabel}
					>
						<X size={16} />
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	)
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("flex items-center justify-end gap-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn("text-base font-semibold text-(--text-primary)", className)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-(--text-secondary)", className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogTrigger,
	DialogPortal,
	DialogClose,
	DialogOverlay,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
