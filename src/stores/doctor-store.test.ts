import { beforeEach, describe, expect, it, vi } from "vitest";

const doctor = vi.fn();
const applyDoctorFix = vi.fn();

vi.mock("@/bindings", () => ({
  commands: {
    doctor: (...args: unknown[]) => doctor(...args),
    applyDoctorFix: (...args: unknown[]) => applyDoctorFix(...args),
  },
}));

import { useDoctorStore } from "./doctor-store";

const fix = {
  kind: "set_id" as const,
  file: "docs/planning/next/x-a.md",
  id: "x",
};
const report = (count: number) => ({
  findings: Array.from({ length: count }, (_, i) => ({
    kind: "id_mismatch" as const,
    file: `docs/planning/next/${i}.md`,
    line: 2,
    message: "m",
    fix,
  })),
  task_files: 3,
  problems: [],
});

describe("useDoctorStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useDoctorStore.setState({
      repoRoot: null,
      report: null,
      checking: false,
      pending: null,
      notice: null,
      error: null,
    });
  });

  it("checks, and fixes only after confirmation, then checks again", async () => {
    doctor.mockResolvedValueOnce(report(1)).mockResolvedValueOnce(report(0));
    applyDoctorFix.mockResolvedValue({
      status: "ok",
      data: { file: fix.file, links: { rewritten: [], problems: [] } },
    });

    await useDoctorStore.getState().check("/repo");
    expect(doctor).toHaveBeenCalledWith("/repo");
    expect(useDoctorStore.getState().report?.findings).toHaveLength(1);

    useDoctorStore.getState().propose(fix);
    expect(applyDoctorFix).not.toHaveBeenCalled();
    expect(useDoctorStore.getState().pending).toEqual(fix);

    await useDoctorStore.getState().confirm();
    expect(applyDoctorFix).toHaveBeenCalledWith("/repo", fix);
    expect(useDoctorStore.getState().pending).toBeNull();
    expect(useDoctorStore.getState().notice).toBe(`Fixed ${fix.file}.`);
    expect(useDoctorStore.getState().report?.findings).toHaveLength(0);
  });

  it("cancelling a proposed fix applies nothing", async () => {
    doctor.mockResolvedValue(report(1));
    await useDoctorStore.getState().check("/repo");
    useDoctorStore.getState().propose(fix);
    useDoctorStore.getState().cancel();
    await useDoctorStore.getState().confirm();
    expect(applyDoctorFix).not.toHaveBeenCalled();
  });

  it("shows a refused fix and the new check", async () => {
    doctor.mockResolvedValue(report(1));
    applyDoctorFix.mockResolvedValue({
      status: "error",
      error: "changed since the check; run the doctor again",
    });
    await useDoctorStore.getState().check("/repo");
    useDoctorStore.getState().propose(fix);
    await useDoctorStore.getState().confirm();
    expect(useDoctorStore.getState().error).toBe(
      "Not fixed: changed since the check; run the doctor again",
    );
    expect(doctor).toHaveBeenCalledTimes(2);
  });

  it("drops the findings of another repository", async () => {
    doctor.mockResolvedValue(report(2));
    await useDoctorStore.getState().check("/old");
    doctor.mockResolvedValue(report(0));
    await useDoctorStore.getState().check("/repo");
    expect(useDoctorStore.getState().report?.findings).toHaveLength(0);
    useDoctorStore.getState().close();
    expect(useDoctorStore.getState().report).toBeNull();
  });
});
