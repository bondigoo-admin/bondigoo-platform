import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Label } from '../../../ui/label.tsx';
import { Button } from '../../../ui/button.tsx';
import { Switch } from '../../../ui/switch.tsx';
import { cn } from '../../../../lib/utils';

const SortableKpiItem = ({ id, name, enabled, onToggle }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center space-x-2 p-2 rounded-md bg-transparent hover:bg-accent transition-colors",
        !enabled && "opacity-50"
      )}
    >
      <Button variant="ghost" size="icon" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing h-8 w-8">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </Button>
      <Label htmlFor={`kpi-switch-${id}`} className="font-normal flex-1 cursor-pointer">
        {name}
      </Label>
      <Switch
        id={`kpi-switch-${id}`}
        checked={enabled}
        onCheckedChange={(checked) => onToggle(id, checked)}
      />
    </div>
  );
};

export default SortableKpiItem;