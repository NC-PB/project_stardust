import { useEffect, useMemo, useState } from "react";
import {
  badgesOf,
  flagsByPath,
  type StaleFlag,
  stalenessFlags,
} from "@/lib/staleness";
import { useBoardStore } from "@/stores/board-store";
import { useSpecStore } from "@/stores/spec-store";
import { useStalenessStore } from "@/stores/staleness-store";

/** Flags are computed again this often, so a day boundary is noticed. */
const TICK_MS = 60_000;

const NO_FLAGS: StaleFlag[] = [];

/**
 * Every staleness flag of the open project, in the order of `stalenessFlags` (`S-staleness`).
 * Computed from the stores; nothing is kept.
 */
export function useStaleFlagList(): StaleFlag[] {
  const repoRoot = useBoardStore((state) => state.repoRoot);
  const config = useBoardStore((state) => state.config);
  const columns = useBoardStore((state) => state.columns);
  const spec = useSpecStore((state) => state.spec);
  const missingPaths = useStalenessStore((state) => state.missingPaths);
  const now = useNow();

  return useMemo(
    () =>
      repoRoot === null || config === null
        ? NO_FLAGS
        : stalenessFlags({
            repoRoot,
            config,
            columns,
            spec,
            missingPaths,
            now,
          }),
    [repoRoot, config, columns, spec, missingPaths, now],
  );
}

/** The time, updated every `TICK_MS`, so a day boundary is noticed. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Every staleness flag of the open project, by the absolute path of its file. */
export function useStaleFlags(): Map<string, StaleFlag[]> {
  const flags = useStaleFlagList();
  return useMemo(() => flagsByPath(flags), [flags]);
}

/** The flags of the file at `path`. */
export function useStaleFlagsOf(path: string | null): StaleFlag[] {
  const flags = useStaleFlags();
  return path === null ? NO_FLAGS : (flags.get(path) ?? NO_FLAGS);
}

/** One small marker per kind of flag; the reasons show on hover. */
export function StaleBadges({ flags }: { flags: StaleFlag[] }) {
  return badgesOf(flags).map((badge) => (
    <span
      key={badge.kind}
      className="font-medium text-amber-600 dark:text-amber-400"
      title={badge.reasons}
    >
      {badge.label}
    </span>
  ));
}
