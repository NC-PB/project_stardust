import { cn } from "cn";
import type { SourceLine } from "@/bindings";
import { gateChecks } from "@/lib/gate";
import { useGateStore } from "@/stores/gate-store";
import { useSpecStore } from "@/stores/spec-store";

interface GateStatusProps {
  /** Opens the spec file at the line of a failing item. */
  onOpen: (at: SourceLine) => void;
}

/** Whether the gate is met (`S-gate`), with the checks the config turns on and each failing item. */
export function GateStatus({ onOpen }: GateStatusProps) {
  const status = useGateStore((state) => state.status);
  const config = useSpecStore((state) => state.config);
  const spec = useSpecStore((state) => state.spec);
  if (status === null || config === null || spec === null) return null;
  const checks = gateChecks(config.gate);

  return (
    <section aria-label="Gate" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-medium",
            status.met
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {status.met ? "Gate met" : "Gate not met"}
        </span>
        <span className="text-muted-foreground">
          {checks.length === 0 ? "No checks enabled" : checks.join(" · ")}
        </span>
      </div>
      {!spec.found && (
        <p className="text-muted-foreground">No spec at {spec.location}.</p>
      )}
      {status.failures.length > 0 && (
        <ul className="space-y-0.5">
          {status.failures.map((failure) => (
            <li key={`${failure.kind}:${failure.at.file}:${failure.at.line}`}>
              <button
                type="button"
                className="text-left hover:underline"
                title={`${failure.at.file}:${failure.at.line}`}
                onClick={() => onOpen(failure.at)}
              >
                {failure.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
