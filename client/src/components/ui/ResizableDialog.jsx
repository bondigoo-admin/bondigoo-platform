import React, { useState, useEffect } from 'react';
import { ResizableBox } from 'react-resizable';
import { Dialog } from './dialog.tsx';
import { MoveDiagonal } from 'lucide-react';
import { cn } from '../../lib/utils';

const CustomResizeHandle = React.forwardRef((props, ref) => {
  const { handleAxis, ...restProps } = props;
  return (
    <div
      ref={ref}
      className="resizable-dialog-handle"
      {...restProps}
    >
      <MoveDiagonal size={16} />
    </div>
  );
});

// Fix: Add a display name to the component
CustomResizeHandle.displayName = 'CustomResizeHandle';

const ResizableDialog = ({ 
  open, 
  onOpenChange, 
  children, 
  className, 
  isFullscreen,
  initialWidth = 800,
  initialHeight = 700
}) => {
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });

  useEffect(() => {
    if (open && !isFullscreen) {
      setSize({ width: initialWidth, height: initialHeight });
    }
  }, [open, isFullscreen, initialWidth, initialHeight]);

  const onResize = (event, { size }) => {
    setSize({ width: size.width, height: size.height });
  };
  
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <ResizableBox
            width={isFullscreen ? window.innerWidth : size.width}
            height={isFullscreen ? (window.innerHeight) : size.height}
            onResize={onResize}
            minConstraints={isFullscreen ? [0, 0] : [600, 500]}
            maxConstraints={isFullscreen ? [Infinity, Infinity] : [window.innerWidth - 40, window.innerHeight - 40]}
            handle={<CustomResizeHandle />}
            className={cn('resizable-dialog-box', { 'fullscreen': isFullscreen })}
            resizeHandles={['se']}
        >
          {React.cloneElement(children, {
            className: cn(children.props.className, 'resizable-dialog-content')
          })}
        </ResizableBox>
    </Dialog>
  );
};

export default ResizableDialog;