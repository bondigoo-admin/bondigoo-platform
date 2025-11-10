import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';

export const useDraggableDialog = (modalRef) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !modalRef.current) return;
      e.preventDefault();
      
      const newX = e.clientX - dragStartOffset.x;
      const newY = e.clientY - dragStartOffset.y;
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      logger.debug('[useDraggableDialog] Dragging started.');
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      if (isDragging) {
         logger.debug('[useDraggableDialog] Dragging ended via cleanup.');
      }
    };
  }, [isDragging, dragStartOffset, modalRef]);

  useEffect(() => {
    if (modalRef.current) {
      if (isPositionManagedByJS) {
        modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
        modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
        modalRef.current.style.setProperty('transform', 'none', 'important');
        modalRef.current.style.setProperty('margin', '0px', 'important');
      } else {
        modalRef.current.style.removeProperty('top');
        modalRef.current.style.removeProperty('left');
        modalRef.current.style.removeProperty('transform');
        modalRef.current.style.removeProperty('margin');
      }
    }
  }, [isPositionManagedByJS, position, modalRef]);

  const handleMouseDownOnTitle = (e) => {
    if (e.button !== 0 || !modalRef.current) return;
    
    const modalRect = modalRef.current.getBoundingClientRect();
    const currentStartX = isPositionManagedByJS ? position.x : modalRect.left;
    const currentStartY = isPositionManagedByJS ? position.y : modalRect.top;

    if (!isPositionManagedByJS) {
      setPosition({ x: currentStartX, y: currentStartY });
      setIsPositionManagedByJS(true);
    }
    
    setIsDragging(true);
    setDragStartOffset({ x: e.clientX - currentStartX, y: e.clientY - currentStartY });
  };

  const resetDialogPosition = () => {
    if (isDragging) {
      setIsDragging(false);
    }
    setIsPositionManagedByJS(false);
    logger.debug('[useDraggableDialog] Dialog position and state reset.');
  };

  return { handleMouseDownOnTitle, resetDialogPosition };
};