import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { GripVertical, Edit, Trash2, Lock, PlayCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import DurationInput from './editor/DurationInput';
import { Badge } from '../ui/badge.tsx';
import { useDndContext } from '@dnd-kit/core';

const formatMinutes = (totalMinutes) => {
  if (typeof totalMinutes !== 'number' || isNaN(totalMinutes) || totalMinutes < 0) return '0m';

  const roundedTotalMinutes = Math.round(totalMinutes * 10) / 10;

  if (roundedTotalMinutes === 0) {
    return totalMinutes > 0 ? '0.1m' : '0m';
  }

  const hours = Math.floor(roundedTotalMinutes / 60);
  const minutes = roundedTotalMinutes % 60;

  let result = '';
  if (hours > 0) result += `${hours}h`;

  const finalMinutes = Math.round(minutes * 10) / 10;
  if (finalMinutes > 0) {
    result += `${result ? ' ' : ''}${finalMinutes}m`;
  }

  return result || '0m';
};

const ModuleItem = ({ module, isActive, onDelete, onUpdate, onClick, isDragging: isDraggingProp = false }) => {
  const { t } = useTranslation(['programs', 'common']);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState(module.title);
  const { active } = useDndContext();
  const isLessonDragging = active?.data.current?.type === 'lesson';

  
  const calculatedDurations = React.useMemo(() => {
    return module.lessons.reduce((acc, lesson) => {
        acc.content += lesson.contentDuration?.minutes || 0;
        acc.completion += lesson.estimatedCompletionTime?.minutes || 0;
        return acc;
    }, { content: 0, completion: 0 });
  }, [module.lessons]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ 
    id: module._id,
    data: {
      type: 'module',
    }
  });

  const isDragging = isDraggingProp || isSortableDragging;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 'auto',
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(module._id);
  };
  
  const handleSaveChanges = () => {
    if (editedTitle.trim() && editedTitle.trim() !== module.title) {
        onUpdate(module._id, { title: editedTitle.trim() });
    }
    setIsDialogOpen(false);
  };
  
  const handleGatedChange = (checked) => {
      onUpdate(module._id, { isGated: checked });
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveChanges();
    }
  };

  const handleDurationUpdate = (type, newMinutes, newIsOverridden) => {
    const updateKey = type === 'content' ? 'contentDuration' : 'estimatedCompletionTime';
    onUpdate(module._id, {
        [updateKey]: {
            minutes: newMinutes,
            isOverridden: newIsOverridden
        }
    });
  };

return (
<div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-4 rounded-lg border p-4 transition-all duration-200",
        isActive 
          ? "border-indigo-400 bg-primary/20 dark:border-indigo-500 dark:bg-primary/20" 
          : "border-border bg-card hover:bg-muted/50 dark:hover:bg-muted/30",
        isDragging && "opacity-75 shadow-xl scale-105",
        isLessonDragging && !isActive && !isDragging && "hover:ring-2 hover:ring-primary"
      )}
      onClick={() => onClick(module._id)}
    >
      <div 
        className="touch-none p-1 text-muted-foreground transition-colors group-hover:text-foreground" 
        {...attributes} 
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
              {module.isGated && <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
              <h3 className="truncate text-base font-semibold text-card-foreground">{module.title}</h3>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="px-2 py-0.5" title={t('label_content_length')}>
              <div className="flex items-center gap-1.5">
                <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{formatMinutes(calculatedDurations.content)}</span>
              </div>
            </Badge>
            <Badge variant="secondary" className="px-2 py-0.5" title={t('label_time_to_complete')}>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                 <span className="text-xs font-medium">{formatMinutes(calculatedDurations.completion)}</span>
              </div>
            </Badge>
          </div>
      </div>
      
<div className="ml-auto flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground"
                  onPointerDown={(e) => e.stopPropagation()} 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditedTitle(module.title);
                    setIsDialogOpen(true);
                  }}
                >
                   <Edit className="h-4 w-4 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50" />
                </Button>
            </DialogTrigger>
            <DialogContent className="flex flex-col h-full sm:h-auto sm:max-w-md p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle className="text-center text-lg">{t('edit_module')}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 space-y-8">
                    <div className="grid gap-2">
                        <Label htmlFor={`moduleTitle-${module._id}`}>{t('field_title')}</Label>
                        <Input 
                            id={`moduleTitle-${module._id}`}
                            value={editedTitle} 
                            onChange={(e) => setEditedTitle(e.target.value)} 
                            onKeyDown={handleTitleKeyDown}
                            className={cn("h-11", "focus-visible:ring-transparent focus-visible:ring-offset-0")}
                        />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <Label htmlFor={`moduleGated-${module._id}`} className="font-normal">{t('lock_module')}</Label>
                        <Switch 
                            id={`moduleGated-${module._id}`}
                            checked={module.isGated} 
                            onCheckedChange={handleGatedChange} 
                            className="focus-visible:ring-transparent focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-6">
                        <DurationInput
                            label={t('label_content_length')}
                            tooltipText={t('tooltip_module_content_length')}
                            calculatedMinutes={calculatedDurations.content}
                            userMinutes={module.contentDuration?.minutes}
                            isOverridden={module.contentDuration?.isOverridden}
                            onUpdate={(mins, isOverridden) => handleDurationUpdate('content', mins, isOverridden)}
                            className="focus-visible:ring-transparent focus-visible:ring-offset-0"
                        />
                          <DurationInput
                            label={t('label_time_to_complete')}
                            tooltipText={t('tooltip_module_time_to_complete')}
                            calculatedMinutes={calculatedDurations.completion}
                            userMinutes={module.estimatedCompletionTime?.minutes}
                            isOverridden={module.estimatedCompletionTime?.isOverridden}
                            onUpdate={(mins, isOverridden) => handleDurationUpdate('completion', mins, isOverridden)}
                            className="focus-visible:ring-transparent focus-visible:ring-offset-0"
                        />
                    </div>
                </div>
                <DialogFooter className="p-6 border-t bg-background">
                    <Button onClick={handleSaveChanges} className="w-full h-11">{t('common:save_changes')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Button variant="delete-ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleDelete}>
             <Trash2 className="h-4 w-4 transition-colors hover:text-red-600 dark:hover:text-red-400" />
         </Button>
      </div>
    </div>
  );
};

export default ModuleItem;