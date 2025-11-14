import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Maximize2, Minimize2 } from "lucide-react"

import { cn } from "../../lib/utils"
import { logger } from "../../utils/logger"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = ({
  className,
  children,
  ...props
}: DialogPrimitive.DialogPortalProps) => (
  <DialogPrimitive.Portal className={cn(className)} {...props}>
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {children}
    </div>
  </DialogPrimitive.Portal>
)
DialogPortal.displayName = DialogPrimitive.Portal.displayName

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/5 transition-all duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  draggable?: boolean
  fullscreenable?: boolean
  resizable?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, draggable = false, fullscreenable = false, resizable = false, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isResizing, setIsResizing] = React.useState(false)
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const [isPositionManagedByJS, setIsPositionManagedByJS] = React.useState(false)
  const [isSizeManagedByJS, setIsSizeManagedByJS] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  
  const combinedRef = React.useCallback((node: HTMLDivElement) => {
    contentRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])

  React.useEffect(() => {
    let interactionStart: {
      clientX: number
      clientY: number
      width: number
      height: number
      left: number
      top: number
    } | null = null;
    let activeResizeHandle: string | null = null;
    
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (e.button !== 0 || !contentRef.current || isFullscreen) return;

      const dragHandle = target.closest('[data-dialog-drag-handle="true"]');
      const resizeHandle = target.closest('[data-dialog-resize-handle]');
      const modalRect = contentRef.current.getBoundingClientRect();
      
      const startInteraction = () => {
        const currentPos = isPositionManagedByJS ? position : { x: modalRect.left, y: modalRect.top };
        const currentSize = isSizeManagedByJS ? size : { width: modalRect.width, height: modalRect.height };
        if (!isPositionManagedByJS) setIsPositionManagedByJS(true);
        if (!isSizeManagedByJS) setIsSizeManagedByJS(true);
        interactionStart = {
          clientX: e.clientX,
          clientY: e.clientY,
          width: currentSize.width,
          height: currentSize.height,
          left: currentPos.x,
          top: currentPos.y,
        };
      };

      if (resizable && resizeHandle) {
        activeResizeHandle = resizeHandle.getAttribute('data-dialog-resize-handle');
        if (!activeResizeHandle) return;
        setIsResizing(true);
        startInteraction();
      } else if (draggable && dragHandle) {
        setIsDragging(true);
        startInteraction();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactionStart) return;

      const { clientX, clientY, width, height, left, top } = interactionStart;
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;

      if (isResizing && activeResizeHandle) {
        let newWidth = width, newHeight = height, newLeft = left, newTop = top;
        if (activeResizeHandle.includes('right')) newWidth = Math.max(300, width + dx);
        if (activeResizeHandle.includes('bottom')) newHeight = Math.max(200, height + dy);
        if (activeResizeHandle.includes('left')) {
          const calculatedWidth = width - dx;
          if (calculatedWidth >= 300) {
            newWidth = calculatedWidth;
            newLeft = left + dx;
          }
        }
        if (activeResizeHandle.includes('top')) {
          const calculatedHeight = height - dy;
          if (calculatedHeight >= 200) {
            newHeight = calculatedHeight;
            newTop = top + dy;
          }
        }
        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newLeft, y: newTop });
      } else if (isDragging) {
        setPosition({ x: left + dx, y: top + dy });
      }
    };

    const handleMouseUp = () => {
      interactionStart = null;
      activeResizeHandle = null;
      setIsDragging(false);
      setIsResizing(false);
    };

    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.addEventListener("mousedown", handleMouseDown);
    }
    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = 'none';
    }

    return () => {
      if (contentEl) {
        contentEl.removeEventListener("mousedown", handleMouseDown);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (document.body) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.body.style.pointerEvents = '';
      }
    };
  }, [
    draggable, resizable, isFullscreen, 
    isPositionManagedByJS, isSizeManagedByJS, 
    position, size, isDragging, isResizing
  ]);

  React.useEffect(() => {
    if (contentRef.current) {
      if (isPositionManagedByJS && !isFullscreen) {
        contentRef.current.style.setProperty('top', `${position.y}px`, 'important');
        contentRef.current.style.setProperty('left', `${position.x}px`, 'important');
        contentRef.current.style.setProperty('transform', 'none', 'important');
        contentRef.current.style.setProperty('margin', '0px', 'important');
      } else {
        contentRef.current.style.removeProperty('top');
        contentRef.current.style.removeProperty('left');
        contentRef.current.style.removeProperty('transform');
        contentRef.current.style.removeProperty('margin');
      }
       if (isSizeManagedByJS && !isFullscreen) {
        contentRef.current.style.setProperty('width', `${size.width}px`, 'important');
        contentRef.current.style.setProperty('height', `${size.height}px`, 'important');
        contentRef.current.style.setProperty('max-width', 'none', 'important');
      } else {
        contentRef.current.style.removeProperty('width');
        contentRef.current.style.removeProperty('height');
        contentRef.current.style.removeProperty('max-width');
      }
    }
  }, [position, size, isPositionManagedByJS, isSizeManagedByJS, isFullscreen]);

  React.useEffect(() => {
    return () => {
        setIsPositionManagedByJS(false);
        setIsSizeManagedByJS(false);
        setIsFullscreen(false);
    }
  }, []);

  const resizeHandles = [
    { name: 'top-left', cursor: 'cursor-nwse-resize', position: 'top-0 left-0 w-4 h-4' },
    { name: 'top-right', cursor: 'cursor-nesw-resize', position: 'top-0 right-0 w-4 h-4' },
    { name: 'bottom-left', cursor: 'cursor-nesw-resize', position: 'bottom-0 left-0 w-4 h-4' },
    { name: 'bottom-right', cursor: 'cursor-nwse-resize', position: 'bottom-0 right-0 w-4 h-4' },
    { name: 'top', cursor: 'cursor-ns-resize', position: 'top-0 left-4 right-4 h-2' },
    { name: 'bottom', cursor: 'cursor-ns-resize', position: 'bottom-0 left-4 right-4 h-2' },
    { name: 'left', cursor: 'cursor-ew-resize', position: 'left-0 top-4 bottom-4 w-2' },
    { name: 'right', cursor: 'cursor-ew-resize', position: 'right-0 top-4 bottom-4 w-2' },
  ];

 return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={combinedRef}
        data-fullscreen={isFullscreen}
        className={cn(
          "group/dialog fixed z-50 flex w-full flex-col border bg-background shadow-lg",
          "max-h-[90dvh] rounded-b-none rounded-t-lg", // Mobile: bottom sheet styles
          "sm:h-auto sm:max-w-lg sm:rounded-lg", // Desktop: reset to centered modal styles
          "animate-in data-[state=open]:fade-in-90 data-[state=open]:slide-in-from-bottom-10 sm:zoom-in-90 data-[state=open]:sm:slide-in-from-bottom-0",
          (isPositionManagedByJS || isSizeManagedByJS) && "animate-none",
          "data-[fullscreen=true]:sm:fixed data-[fullscreen=true]:sm:!top-[var(--app-header-height,72px)] data-[fullscreen=true]:sm:!left-0 data-[fullscreen=true]:sm:!w-screen data-[fullscreen=true]:sm:!h-[calc(100vh_-_var(--app-header-height,72px))] data-[fullscreen=true]:sm:!max-w-full data-[fullscreen=true]:sm:!rounded-none data-[fullscreen=true]:sm:!border-none data-[fullscreen=true]:sm:!translate-x-0 data-[fullscreen=true]:sm:!translate-y-0",
          className
        )}
        {...props}
      >
        <div className="flex-1 overflow-y-auto p-6 pb-[calc(1.5rem+var(--safe-area-inset-bottom))]">
          {children}
        </div>
        {resizable && !isFullscreen && resizeHandles.map(handle => (
          <div
            key={handle.name}
            data-dialog-resize-handle={handle.name}
            className={cn('absolute z-[60]', handle.cursor, handle.position)}
          />
        ))}
        <div className="absolute top-2 right-2 flex items-center gap-0">
          {fullscreenable && (
            <button
              onClick={() => setIsFullscreen(p => !p)}
              title={isFullscreen ? "Minimize" : "Maximize"}
              aria-label={isFullscreen ? "Minimize" : "Maximize"}
              className="hidden h-9 w-9 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none sm:flex"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <DialogPrimitive.Close className="relative flex h-9 w-9 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

interface DialogTitleProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
  draggable?: boolean
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ className, draggable = false, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-dialog-drag-handle={draggable}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      draggable && "cursor-move",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </DialogPrimitive.Close>
))
DialogClose.displayName = DialogPrimitive.Close.displayName


export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
}