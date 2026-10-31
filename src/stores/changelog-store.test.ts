import { beforeEach, describe, expect, it, vi } from "vitest";

const changelogTags = vi.fn();
const draftChangelog = vi.fn();
const writeChangelog = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    changelogTags: (...args: unknown[]) => changelogTags(...args),
    draftChangelog: (...args: unknown[]) => draftChangelog(...args),
    writeChangelog: (...args: unknown[]) => writeChangelog(...args),
  },
}));

import { useChangelogStore } from "./changelog-store";

const noGit = { available: false, reason: "not a git repository", tags: [] };
const withTags = {
  available: true,
  reason: null,
  tags: [
    { name: "v0.2.0", date: "2026-10-20" },
    { name: "v0.1.0", date: "2026-10-01" },
  ],
};
const draft = (section = "## 2026-10-31\n") => ({
  path: "CHANGELOG.md",
  range: "finished on or after 2026-10-01",
  groups:
    section === ""
      ? []
      : [
          {
            tag: "board",
            entries: [{ id: "x", title: "T", completed: "", path: "" }],
          },
        ],
  skipped: [],
  section,
  existing: "# Changelog\n",
  text: `# Changelog\n\n${section}`,
});

describe("useChangelogStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useChangelogStore.setState({
      repoRoot: null,
      open: false,
      tags: null,
      mode: "date",
      date: "",
      tag: "",
      draft: null,
      written: null,
      error: null,
    });
  });

  it("starts at the newest tag when there are tags", async () => {
    changelogTags.mockResolvedValue(withTags);
    await useChangelogStore.getState().start("/repo");
    const state = useChangelogStore.getState();
    expect(state.open).toBe(true);
    expect(state.mode).toBe("tag");
    expect(state.tag).toBe("v0.2.0");
  });

  it("stays on the date without git", async () => {
    changelogTags.mockResolvedValue(noGit);
    await useChangelogStore.getState().start("/repo");
    expect(useChangelogStore.getState().mode).toBe("date");
    expect(useChangelogStore.getState().tags).toEqual(noGit);
  });

  it("previews, writes only on confirm, over the text read", async () => {
    changelogTags.mockResolvedValue(noGit);
    draftChangelog.mockResolvedValue({ status: "ok", data: draft() });
    writeChangelog.mockResolvedValue({ status: "ok", data: null });
    const store = useChangelogStore.getState();
    await store.start("/repo");
    store.setDate("2026-10-01");
    await useChangelogStore.getState().preview();

    expect(draftChangelog).toHaveBeenCalledWith("/repo", {
      kind: "date",
      date: "2026-10-01",
    });
    expect(useChangelogStore.getState().draft).toEqual(draft());
    expect(writeChangelog).not.toHaveBeenCalled();

    await useChangelogStore.getState().confirm();
    expect(writeChangelog).toHaveBeenCalledWith(
      "/repo",
      "# Changelog\n",
      "# Changelog\n\n## 2026-10-31\n",
    );
    const state = useChangelogStore.getState();
    expect(state.draft).toBeNull();
    expect(state.open).toBe(false);
    expect(state.written).toBe("1 entry added to CHANGELOG.md");
  });

  it("asks for a date instead of previewing an empty one", async () => {
    changelogTags.mockResolvedValue(noGit);
    await useChangelogStore.getState().start("/repo");
    await useChangelogStore.getState().preview();
    expect(draftChangelog).not.toHaveBeenCalled();
    expect(useChangelogStore.getState().error).toBe("Choose a date");
  });

  it("does not write an empty draft and reports a refused write", async () => {
    changelogTags.mockResolvedValue(noGit);
    draftChangelog.mockResolvedValueOnce({ status: "ok", data: draft("") });
    await useChangelogStore.getState().start("/repo");
    useChangelogStore.getState().setDate("2026-10-01");
    await useChangelogStore.getState().preview();
    await useChangelogStore.getState().confirm();
    expect(writeChangelog).not.toHaveBeenCalled();

    draftChangelog.mockResolvedValueOnce({ status: "ok", data: draft() });
    writeChangelog.mockResolvedValue({
      status: "error",
      error: "CHANGELOG.md changed on disk since the preview; preview again",
    });
    await useChangelogStore.getState().preview();
    await useChangelogStore.getState().confirm();
    const state = useChangelogStore.getState();
    expect(state.draft).toBeNull();
    expect(state.error).toContain("changed on disk");
  });

  it("drops the draft when an input changes", async () => {
    changelogTags.mockResolvedValue(noGit);
    draftChangelog.mockResolvedValue({ status: "ok", data: draft() });
    await useChangelogStore.getState().start("/repo");
    useChangelogStore.getState().setDate("2026-10-01");
    await useChangelogStore.getState().preview();
    useChangelogStore.getState().setDate("2026-10-02");
    expect(useChangelogStore.getState().draft).toBeNull();
  });
});
