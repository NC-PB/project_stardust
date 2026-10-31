import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";

type RailButtonProps = ComponentProps<"button"> & {
  icon: LucideIcon;
  label: string;
  /** Shown as chosen: the view on screen, the brief shown, the menu open. */
  active?: boolean;
};

/** One button of the rail (`S-window-layout`): an icon over its name. */
export const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(
  function RailButton({ icon: Icon, label, active, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "group relative flex w-12 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] leading-none text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-card text-foreground",
          className,
        )}
        {...props}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-1.5 bottom-1.5 -left-1 w-0.5 rounded-full bg-primary"
          />
        )}
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={cn("size-[18px]", active && "text-primary")}
        />
        <span>{label}</span>
      </button>
    );
  },
);
