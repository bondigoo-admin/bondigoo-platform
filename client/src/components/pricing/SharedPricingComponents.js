import React from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

// UI Components
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';

export const StatusBadge = ({ active, className = '' }) => {
  const { t } = useTranslation('common');
  return (
    <Badge variant={active ? "default" : "secondary"} className={cn(className)}>
      {active ? t('active') : t('inactive')}
    </Badge>
  );
};

export const DeleteButton = ({ onDelete, disabled, title }) => {
  const { t } = useTranslation('common');
  return (
    <TooltipProvider delayDuration={100}>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                  variant="delete-destructive"
                  size="icon"
                  onClick={onDelete}
                  disabled={disabled}
                 
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">{title || t('remove')}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{title || t('remove')}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
  );
};

export const CollapsibleHeader = ({ 
  title, 
  icon: Icon, 
  expanded, 
  onToggle,
  className = '' 
}) => {
  return (
    <div 
      className={cn(
        "flex items-center justify-between cursor-pointer p-4 rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      aria-expanded={expanded}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex-shrink-0 grid place-items-center w-8 h-8 rounded-full bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <h3 className="font-semibold text-base">{title}</h3>
      </div>
      {expanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
};