import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils" 

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 gap-2 [&_svg]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:text-indigo-50 dark:hover:bg-indigo-500/90",
        primary:
          "bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:text-indigo-50 dark:hover:bg-indigo-500/90",
        destructive:
          "text-slate-600 hover:text-white dark:text-slate-400 dark:hover:text-red-400",
        outline:
          "border border-indigo-200 bg-transparent hover:bg-indigo-50 text-indigo-700 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        input:
          "border border-input bg-background hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600",
       "action-accept":
          "border border-green-500 bg-transparent text-green-600 hover:bg-green-500 hover:text-white dark:border-green-600 dark:text-green-500 dark:hover:bg-green-600 dark:hover:text-white",
        "action-decline":
          "border border-red-500 bg-transparent text-red-600 hover:bg-red-500 hover:text-white dark:border-red-600 dark:text-red-500 dark:hover:bg-red-600 dark:hover:text-white",
        "action-suggest":
          "border border-slate-400 bg-transparent text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800",
        "action-star":
          "border border-yellow-500 bg-transparent text-yellow-600 hover:bg-yellow-50 dark:border-yellow-500/50 dark:text-yellow-400 dark:hover:bg-yellow-900/20",
        "action-pay":
          "border border-green-600 bg-transparent text-green-700 hover:bg-green-50 dark:border-green-500/80 dark:text-green-400 dark:hover:bg-green-900/20",
        secondary:
          "bg-indigo-100 text-indigo-700 hover:bg-indigo-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
        ghost: "text-slate-700 dark:text-slate-400",
        link: "text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400",
        save: "bg-[#4a90e2] text-white hover:bg-[#3a7bc8]",
        hero: "border border-primary-foreground/50 bg-white/10 text-primary-foreground backdrop-blur-sm hover:bg-white/20 dark:text-foreground dark:border-foreground/30",
        success:
          "bg-green-600 text-white hover:bg-green-600/90 dark:bg-green-700 dark:text-green-50 dark:hover:bg-green-700/90",
        warning:
          "bg-yellow-600 text-white hover:bg-yellow-600/90 dark:bg-yellow-700 dark:text-yellow-50 dark:hover:bg-yellow-700/90",
        info:
          "bg-blue-600 text-white hover:bg-blue-600/90 dark:bg-blue-700 dark:text-blue-50 dark:hover:bg-blue-700/90",
        subtle:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
        delete:
          "bg-red-600 text-white hover:bg-red-600/90 dark:bg-red-700 dark:text-red-50 dark:hover:bg-red-700/90",
        "delete-outline":
          "border border-red-200 bg-transparent hover:bg-red-50 text-red-700 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-800 dark:hover:text-red-100",
       "delete-ghost": "text-slate-700 dark:text-slate-400",
       "delete-destructive": "text-slate-700 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400",
        "delete-link": "text-red-600 underline-offset-4 hover:underline dark:text-red-400",
      "calendar-day":
          "h-9 w-9 p-0 font-normal rounded-md hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2 rounded-md",
        th: "h-7 px-3 rounded-sm",
        sm: "h-9 px-3 rounded-sm",
        lg: "h-11 px-8 rounded-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-sm p-0 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

// Reverted to the simple, standard implementation that works correctly with `asChild`
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }