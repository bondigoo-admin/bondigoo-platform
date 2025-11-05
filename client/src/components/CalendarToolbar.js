import React, { useMemo } from 'react';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.jsx';
import { Button } from './ui/button.tsx';
import { Calendar } from './ui/calendar.jsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu.tsx';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, Minus, Plus } from 'lucide-react';

const CalendarToolbar = ({
  currentDate,
  onNavigate,
  view,
  onView,
  views = ['month', 'week', 'day'],
  sessionTypes = [],
  selectedSessionTypes,
  onFilterChange,
  getTranslatedSessionTypeName,
  onZoom,
  zoomDisabled,
}) => {
  const { t } = useTranslation('managesessions');

  const handleNavigate = (action) => {
    onNavigate(action);
  };

  const handleViewChange = (newView) => {
    if (newView) onView(newView);
  };

  const dateRangeLabel = useMemo(() => {
    const start = moment(currentDate).startOf(view);
    const end = moment(currentDate).endOf(view);

    if (view === 'month') {
      return start.format('MMMM YYYY');
    }
    if (view === 'week') {
      if (start.month() === end.month()) {
        return `${start.format('MMM D')} - ${end.format('D, YYYY')}`;
      }
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }
    return start.format('MMMM D, YYYY');
  }, [currentDate, view]);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 border-b bg-muted/30 dark:bg-muted/10">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => handleNavigate('TODAY')}>{t('today')}</Button>
        <div className="inline-flex items-center">
          <Button variant="outline" size="icon" onClick={() => handleNavigate('PREV')} className="rounded-r-none">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleNavigate('NEXT')} className="rounded-l-none border-l-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full md:w-[260px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              <span className="truncate">{dateRangeLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={(date) => onNavigate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <Filter className="mr-2 h-4 w-4" />
              {t('filter')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('sessionTypes')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sessionTypes.map((type) => (
              <DropdownMenuCheckboxItem
                key={type.id}
                checked={selectedSessionTypes.includes(type.id)}
                onSelect={(e) => {
                  e.preventDefault();
                  onFilterChange(type.id);
                }}
              >
                {getTranslatedSessionTypeName(type.id)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden items-center bg-background border border-input rounded-full shadow-sm sm:flex">
          <button onClick={() => onZoom('out')} disabled={zoomDisabled.out} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-opacity rounded-l-full">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-px h-4 bg-border"></span>
          <button onClick={() => onZoom('in')} disabled={zoomDisabled.in} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-opacity rounded-r-full">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <ToggleGroup type="single" value={view} onValueChange={handleViewChange} aria-label="Calendar View">
          <ToggleGroupItem value="month">{t('month')}</ToggleGroupItem>
          <ToggleGroupItem value="week">{t('week')}</ToggleGroupItem>
          <ToggleGroupItem value="day">{t('day')}</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
};

export default CalendarToolbar;