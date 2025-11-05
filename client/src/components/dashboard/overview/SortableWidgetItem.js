import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Settings } from 'lucide-react';
import { Switch } from '../../ui/switch.tsx';
import { Button } from '../../ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/dropdown-menu.tsx';

const SortableWidgetItem = ({ id, name, enabled, onToggle, settings, onSettingsChange, SettingsComponent }) => {
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
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-background rounded-lg border"
    >
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </Button>
        <span className="font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {SettingsComponent && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="left"
              align="start"
              className="w-80"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <SettingsComponent settings={settings} onSettingsChange={onSettingsChange} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onToggle(id, checked)}
          aria-label={`Toggle ${name} widget`}
        />
      </div>
    </div>
  );
};

export default SortableWidgetItem;