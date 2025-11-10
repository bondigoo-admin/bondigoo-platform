import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cva } from "class-variance-authority"

import { cn } from "../../lib/utils"

const progressVariants = cva(
  "h-full w-full flex-1",
  {
    variants: {
      variant: {
        default: "bg-foreground",
        yellow: "bg-yellow-400",
        "on-dark": "bg-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);


const Progress = React.forwardRef(({ className, value, variant, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(progressVariants({ variant }))}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };