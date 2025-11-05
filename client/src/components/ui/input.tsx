import * as React from "react"
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button.tsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ElementType;
  variant?: 'default' | 'compact' | 'glass';
  position?: 'left' | 'right' | 'middle';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, icon: Icon, variant = 'default', position, size = 'default', ...props }, ref) => {
    const id = React.useId();
    const [isVisible, setIsVisible] = React.useState(false);
    const inputType = type === 'password' ? (isVisible ? 'text' : 'password') : type;

    const isCompact = variant === 'compact';
    const isGlass = variant === 'glass';
    const isLarge = size === 'large';

    return (
      <div className={cn("relative", className)}>
      <input
          id={id}
          type={inputType}
          ref={ref}
          placeholder=" "
          className={cn(
            "peer block w-full appearance-none border bg-card text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:relative focus:z-10",
             type === 'number' && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
             // Default variant styles
             !isCompact && "rounded-xl border-slate-300 focus:border-indigo-600 dark:border-slate-600 dark:focus:border-indigo-500",
             !isCompact && (Icon ? "pl-11" : "px-4"),
            !isCompact && (type === 'password' ? "pr-12" : "pr-4"),
            // Compact variant styles
            isCompact && "rounded-md border-input py-2 hover:border-slate-400 focus:border-slate-500 dark:border-slate-800 dark:hover:border-slate-600 dark:focus:border-slate-600",
            isCompact && (Icon ? "pl-11" : "px-3"),
            isCompact && (type === 'password' ? "pr-12" : "pr-3"),
            isLarge ? "h-12" : "h-10",
            position === 'left' && 'rounded-r-none',
            position === 'right' && 'rounded-l-none',
            position === 'middle' && 'rounded-none',
            // --- UPDATED & FIXED: Glass variant overrides ---
            isGlass && "bg-white/40 dark:bg-black/20 border-white/50 dark:border-white/20 text-slate-900 dark:text-white placeholder:text-transparent focus:border-primary dark:focus:border-primary backdrop-blur-sm"
          )}
          {...props}
        />
         {label && (
            <label
            htmlFor={id}
            className={cn(
              "absolute text-sm text-slate-500 dark:text-slate-400 duration-300 transform origin-[0] pointer-events-none z-10",
              "top-0 -translate-y-1/2 scale-75 bg-card px-2 rounded-full",
              "peer-placeholder-shown:scale-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:bg-transparent peer-placeholder-shown:px-0 peer-placeholder-shown:rounded-none peer-placeholder-shown:z-0",
              "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:scale-75 peer-focus:z-20 peer-focus:px-2 peer-focus:rounded-full",
              !isGlass && "peer-focus:bg-card",
              isCompact ? (Icon ? 'left-11' : 'left-3') : (Icon ? 'left-11' : 'left-4'),
              "peer-focus:text-indigo-600 dark:peer-focus:text-indigo-500",
               // --- UPDATED & FIXED: Glass variant overrides ---
              isGlass && "bg-transparent text-slate-600 dark:text-slate-300 peer-placeholder-shown:text-slate-600 dark:peer-placeholder-shown:text-slate-300 peer-focus:text-primary dark:peer-focus:text-primary"
            )}
            >
            {label}
            </label>
        )}
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 z-10">
             {/* --- UPDATED & FIXED: Glass variant icon color --- */}
            <Icon className={cn("h-5 w-5 text-slate-400", isGlass && "text-slate-500 dark:text-slate-400")} />
          </div>
        )}
       {type === 'password' && (
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsVisible(v => !v)} 
            className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2",
                isCompact ? "h-8 w-8" : "h-10 w-10",
                // This was already mostly correct, but we'll ensure it works with the new glass variant
                isGlass 
                  ? "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
            aria-label={isVisible ? "Hide password" : "Show password"}
          >
            {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
          </Button>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };