import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const LiveStatusIndicator = ({ status, isCompact = false }) => {
  const { t } = useTranslation('common');

  const statusConfig = {
    online: {
      classes: 'bg-green-500 dark:bg-green-400 animate-pulse',
      label: t('status.online', 'Online'),
    },
    on_break: {
      classes: 'bg-yellow-500 dark:bg-yellow-400',
      label: t('status.on_break', 'On a Short Break'),
    },
    busy: {
      classes: 'bg-red-500 dark:bg-red-400',
      label: t('status.busy', 'Busy'),
    },
    offline: {
      classes: 'bg-slate-400 dark:bg-slate-600',
      label: t('status.offline', 'Offline'),
    },
  };

  const currentStatus = statusConfig[status] || statusConfig.offline;
  const sizeClasses = isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className={cn('rounded-full', sizeClasses, currentStatus.classes)}></div>
            {!isCompact && <span className="text-sm text-muted-foreground">{currentStatus.label}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{currentStatus.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default LiveStatusIndicator;