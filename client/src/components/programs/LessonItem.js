import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { GripVertical, Trash2, Video, FileText, File as FileIcon, Lightbulb, ClipboardCheck, Edit, Presentation, PlayCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

const getIcon = (contentType) => {
    const props = { className: "h-5 w-5" };
    switch (contentType) {
      case 'video': return <Video {...props} />;
      case 'text': return <FileText {...props} />;
      case 'document': return <FileIcon {...props} />;
      case 'quiz': return <Lightbulb {...props} />;
      case 'assignment': return <ClipboardCheck {...props} />;
      case 'presentation': return <Presentation {...props} />;
      default: return <FileText {...props} />;
    }
};

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

const LessonItem = ({ lesson, onSelect, onEdit, onDelete, isSelected, moduleId }) => {
  const { t } = useTranslation(['programs', 'common']);
  
   const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: lesson._id,
    data: {
      type: 'lesson',
      moduleId: moduleId
    }
  });

const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete();
  };

  const hasDurationInfo = (lesson.contentDuration?.minutes > 0 || lesson.estimatedCompletionTime?.minutes > 0);

  return (
<div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group lesson-item flex items-center gap-2 p-3 border rounded-md transition-colors cursor-pointer",
        isSelected ? "bg-primary/10 border-primary/50" : "bg-card hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
        <div className="flex items-center text-muted-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-5 w-5" />
        </div>
        <div className="text-muted-foreground">
            {getIcon(lesson.contentType)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{lesson.title}</p>
          {hasDurationInfo && (
            <div className="flex items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5 flex-wrap">
              {lesson.contentDuration?.minutes > 0 && (
                <div className="flex items-center gap-1" title={t('label_content_length')}>
                    <PlayCircle className="h-3 w-3" />
                    <span>{formatMinutes(lesson.contentDuration.minutes)}</span>
                </div>
              )}
              {lesson.estimatedCompletionTime?.minutes > 0 && (
                <div className="flex items-center gap-1" title={t('label_time_to_complete')}>
                    <Clock className="h-3 w-3" />
                    <span>{formatMinutes(lesson.estimatedCompletionTime.minutes)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      <div className="lesson-item__actions flex items-center ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleEdit}>
                <Edit className="h-4 w-4 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50" />
            </Button>
            <Button  variant="delete-destructive" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 transition-colors hover:text-red-600 dark:hover:text-red-400" />
            </Button>
        </div>
    </div>
  );
};

export default LessonItem;