import * as React from "react"
import PropTypes from 'prop-types';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
} from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { format } from 'date-fns';
import { enUS, de, fr } from "date-fns/locale";

import { cn } from "../../lib/utils"
import { Button, buttonVariants } from "./button.tsx"
import { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
import { ScrollArea } from './scroll-area.jsx';

const localeMap = {
  en: enUS,
  de,
  fr,
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}) {
  const { i18n } = useTranslation();
  const locale = localeMap[i18n.language] || enUS;
  const defaultClassNames = getDefaultClassNames()

  return (
    (<DayPicker
      locale={locale}
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:2.25rem]",
        "[[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaultClassNames.months),
       month: cn("flex w-full flex-col gap-0 space-y-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn("bg-popover absolute inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn("select-none font-medium", captionLayout === "label"
          ? "text-sm"
          : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5", defaultClassNames.caption_label),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
          weekday: cn(
          "text-muted-foreground w-9 text-[0.8rem] font-normal",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn("w-[--cell-size] select-none", defaultClassNames.week_number_header),
        week_number: cn(
          "text-muted-foreground select-none text-[0.8rem]",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative h-[--cell-size] w-[--cell-size] p-0 text-center focus-within:relative focus-within:z-20",
          "[&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
          defaultClassNames.day
        ),
        range_start: cn("day-range-start", defaultClassNames.range_start),
        range_middle: cn("day-range-middle rounded-none", defaultClassNames.range_middle),
        range_end: cn("day-range-end", defaultClassNames.range_end),
        today: cn(

          "rounded-md border text-accent-foreground",

          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground opacity-50 aria-selected:text-muted-foreground aria-selected:bg-accent/50",
          defaultClassNames.outside
        ),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (<div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />);
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (<ChevronLeftIcon className={cn("size-4", className)} {...props} />);
          }

          if (orientation === "right") {
            return (<ChevronRightIcon className={cn("size-4", className)} {...props} />);
          }

          return (<ChevronDownIcon className={cn("size-4", className)} {...props} />);
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            (<td {...props}>
              <div
                className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>)
          );
        },
        ...components,
      }}
      {...props} />)
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost" // Use a neutral variant for full styling control
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
       className={cn(
        "h-full w-full rounded-md p-0 font-normal", // Fills parent cell for consistent size
        "hover:bg-accent hover:text-accent-foreground", // Default hover state
        
        // Use explicit indigo colors to match selected time buttons and fix visibility
        "data-[selected-single=true]:bg-indigo-600 data-[selected-single=true]:text-white data-[selected-single=true]:hover:bg-indigo-600/90 data-[selected-single=true]:focus:bg-indigo-600",
        "data-[selected-single=true]:dark:bg-indigo-500 data-[selected-single=true]:dark:text-indigo-50",
        "data-[range-start=true]:bg-indigo-600 data-[range-start=true]:text-white data-[range-start=true]:hover:bg-indigo-600/90 data-[range-start=true]:rounded-r-none",
        "data-[range-start=true]:dark:bg-indigo-500 data-[range-start=true]:dark:text-indigo-50",
        "data-[range-end=true]:bg-indigo-600 data-[range-end=true]:text-white data-[range-end=true]:hover:bg-indigo-600/90 data-[range-end=true]:rounded-l-none",
        "data-[range-end=true]:dark:bg-indigo-500 data-[range-end=true]:dark:text-indigo-50",
        
        // Unchanged style for days in the middle of a range
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground",
        
        // Unchanged focus and layout styles
        "group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 group-data-[focused=true]/day:ring-2",
        "flex flex-col gap-1 leading-none [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props} />
  );
}

// --- START: NEW DATE-ONLY PICKER COMPONENT ---
function DatePicker({ value, onChange, placeholder }) {
  const { t, i18n } = useTranslation(['common']);
  const locale = localeMap[i18n.language];
  const date = value ? new Date(value) : null;

  // Set default view to 20 years ago for a better DOB selection experience
  const defaultMonth = new Date();
  defaultMonth.setFullYear(defaultMonth.getFullYear() - 20);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP", { locale }) : <span>{placeholder || t('common:pickADate', 'Pick a date')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          // Set default view
          defaultMonth={defaultMonth}
          // Enable year/month dropdowns for easy navigation
          captionLayout="dropdown-buttons"
          // Set a range for birth dates, e.g., 100 years in the past up to today
          fromYear={new Date().getFullYear() - 100}
          toYear={new Date().getFullYear()}
          // Disable selection of future dates
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}

DatePicker.propTypes = {
    value: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
};
// --- END: NEW DATE-ONLY PICKER COMPONENT ---


function DateTimePicker({ value, onChange, fromDate }) {
  const { t, i18n } = useTranslation(['common']);
  const [isOpen, setIsOpen] = React.useState(false);

  const date = value ? new Date(value) : null;
  const locale = localeMap[i18n.language];
  
  const hourRef = React.useRef(null);
  const minuteRef = React.useRef(null);

  // THE FIX: Create looped arrays to simulate infinite scrolling
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const loopedHours = [...hours, ...hours, ...hours];
  const loopedMinutes = [...minutes, ...minutes, ...minutes];

  React.useEffect(() => {
    if (isOpen && date) {
      setTimeout(() => {
          // THE FIX: These will now always have enough space to center perfectly
          hourRef.current?.scrollIntoView({ block: 'center' });
          minuteRef.current?.scrollIntoView({ block: 'center' });
      }, 100);
    }
  }, [isOpen, date]);

  const handleDateSelect = (selectedDate) => {
    if (!selectedDate) {
      onChange(null);
      return;
    }
    const newDate = new Date(selectedDate);
    if (date) {
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
    } else {
      newDate.setHours(23, 59, 0, 0);
    }
    onChange(newDate);
  };

  const handleTimeChange = (part, newValue) => {
    if (!date) return;
    const newDate = new Date(date);
    if (part === 'hour') {
      newDate.setHours(parseInt(newValue, 10));
    } else if (part === 'minute') {
      newDate.setMinutes(parseInt(newValue, 10));
    }
    onChange(newDate);
  };

  const selectedHour = date ? date.getHours() : null;
  const selectedMinute = date ? date.getMinutes() : null;

  // THE FIX: Calculate the index of the item in the MIDDLE of the looped array to attach the ref to
  const hourRefIndex = date ? hours.length + selectedHour : null;
  const minuteRefIndex = date ? minutes.length + Math.floor(selectedMinute / 5) : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-10',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            format(date, 'PPP HH:mm', { locale })
          ) : (
            <span>{t('common:pickADateTime', 'Pick a date and time')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <div className="flex flex-col sm:flex-row sm:items-end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            initialFocus
            fromDate={fromDate}
          />
          <div className="flex items-start border-t sm:border-t-0 sm:border-l">
            <ScrollArea className="h-80 w-16">
              <div className="p-1">
                {/* THE FIX: Map over the looped array */}
                {loopedHours.map((hour, index) => {
                  const isSelected = selectedHour === hour;
                  return (
                    <div key={`hour-${index}`} ref={index === hourRefIndex ? hourRef : null} className="px-1 py-0.5">
                      <Button
                        variant={isSelected ? 'default' : 'ghost'}
                        size="sm"
                        className="w-full"
                        onClick={() => handleTimeChange('hour', hour.toString())}
                        disabled={!date}
                      >
                        {hour.toString().padStart(2, '0')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <ScrollArea className="h-80 w-16 border-l">
              <div className="p-1">
                {/* THE FIX: Map over the looped array */}
                {loopedMinutes.map((minute, index) => {
                  const isSelected = selectedMinute !== null && Math.floor(selectedMinute / 5) * 5 === minute;
                  return (
                    <div key={`minute-${index}`} ref={index === minuteRefIndex ? minuteRef : null} className="px-1 py-0.5">
                        <Button
                          variant={isSelected ? 'default' : 'ghost'}
                          size="sm"
                          className="w-full"
                          onClick={() => handleTimeChange('minute', minute.toString())}
                          disabled={!date}
                        >
                          {minute.toString().padStart(2, '0')}
                        </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

DateTimePicker.propTypes = {
    value: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
    onChange: PropTypes.func.isRequired,
    fromDate: PropTypes.instanceOf(Date),
};


function TimePicker({ value, onChange }) {
  const { t, i18n } = useTranslation(['common']);
  const [isOpen, setIsOpen] = React.useState(false);

  const date = value ? new Date(value) : new Date();
  const hasValue = value !== null && value !== undefined;
  const locale = localeMap[i18n.language];
  
  const hourRef = React.useRef(null);
  const minuteRef = React.useRef(null);

  // THE FIX: Create looped arrays to simulate infinite scrolling
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const loopedHours = [...hours, ...hours, ...hours];
  const loopedMinutes = [...minutes, ...minutes, ...minutes];

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
          // THE FIX: These will now always have enough space to center perfectly
          hourRef.current?.scrollIntoView({ block: 'center' });
          minuteRef.current?.scrollIntoView({ block: 'center' });
      }, 100);
    }
  }, [isOpen, date]);

  const handleTimeChange = (part, newValue) => {
    const newDate = hasValue ? new Date(value) : new Date();
    newDate.setSeconds(0, 0); 
    if (part === 'hour') {
      newDate.setHours(parseInt(newValue, 10));
    } else if (part === 'minute') {
      newDate.setMinutes(parseInt(newValue, 10));
    }
    onChange(newDate);
  };

  const selectedHour = date.getHours();
  const selectedMinute = date.getMinutes();

  // THE FIX: Calculate the index of the item in the MIDDLE of the looped array to attach the ref to
  const hourRefIndex = hours.length + selectedHour;
  const minuteRefIndex = minutes.length + Math.floor(selectedMinute / 5);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[8rem] justify-start text-left font-normal h-10',
            !hasValue && 'text-muted-foreground'
          )}
        >
          <ClockIcon className="mr-2 h-4 w-4" />
          {hasValue ? (
            format(date, 'HH:mm', { locale })
          ) : (
            <span>{t('common:pickATime', 'Pick a time')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[8rem] p-0" align="start">
        <div className="flex items-start">
          <ScrollArea className="h-80 w-1/2">
            <div className="p-1">
              {/* THE FIX: Map over the looped array */}
              {loopedHours.map((hour, index) => {
                const isSelected = selectedHour === hour;
                return (
                  <div key={`hour-${index}`} ref={index === hourRefIndex ? hourRef : null} className="px-1 py-0.5">
                    <Button
                      variant={isSelected ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full"
                      onClick={() => handleTimeChange('hour', hour.toString())}
                    >
                      {hour.toString().padStart(2, '0')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <ScrollArea className="h-80 w-1/2 border-l">
            <div className="p-1">
              {/* THE FIX: Map over the looped array */}
              {loopedMinutes.map((minute, index) => {
                const isSelected = Math.floor(selectedMinute / 5) * 5 === minute;
                return (
                  <div key={`minute-${index}`} ref={index === minuteRefIndex ? minuteRef : null} className="px-1 py-0.5">
                      <Button
                        variant={isSelected ? 'default' : 'ghost'}
                        size="sm"
                        className="w-full"
                        onClick={() => handleTimeChange('minute', minute.toString())}
                      >
                        {minute.toString().padStart(2, '0')}
                      </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

TimePicker.propTypes = {
    value: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
    onChange: PropTypes.func.isRequired,
};

// --- ACTION: Export the new DatePicker component ---
export { Calendar, CalendarDayButton, DatePicker, DateTimePicker, TimePicker }