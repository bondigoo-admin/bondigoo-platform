import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "../../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./popover.jsx"

export type OptionType = {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: OptionType[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  placeholder?: string;
}

function MultiSelect({
  options,
  selected,
  onChange,
  className,
  placeholder = "Select options...",
  ...props
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const toggleSelect = (itemValue: string) => {
    if (selected.includes(itemValue)) {
      onChange(selected.filter((i) => i !== itemValue));
    } else {
      onChange([...selected, itemValue]);
    }
  }

  const selectedLabels = options
    .filter(option => selected.includes(option.value))
    .map(option => option.label)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true} {...props}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal transition-colors hover:border-slate-400 focus:outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:border-slate-600 dark:focus:border-slate-600",
            className
          )}
        >
          <span className={cn(
            "truncate",
            selected.length === 0 && "text-muted-foreground"
          )}>
            {selected.length > 0 ? selectedLabels : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 border bg-popover text-popover-foreground shadow-md" align="start">
        <div className="max-h-[300px] overflow-y-auto p-1">
          {options.length > 0 ? (
            options.map((option) => {
              const isSelected = selected.includes(option.value)
              return (
                <div
                  key={option.value}
                  onClick={() => toggleSelect(option.value)}
                  role="option"
                  aria-selected={isSelected}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4" />}
                  </span>
                  {option.label}
                </div>
              )
            })
          ) : (
             <div className="py-6 text-center text-sm text-muted-foreground">No options found.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { MultiSelect }