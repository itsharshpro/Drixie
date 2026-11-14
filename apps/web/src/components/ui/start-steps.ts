export type StepState = "loading" | "todo" | "current" | "done";

export function startSteps(input: { profile: boolean | null; picked: boolean; invested: number | null }): [StepState, StepState, StepState] {
  if (input.profile === null || input.invested === null) return ["loading", "loading", "loading"];
  if (input.invested > 0) return ["done", "done", "done"];
  const done = [input.profile, input.picked, false];
  const first = done.findIndex((d) => !d);
  return done.map((d, i) => (d ? "done" : i === first ? "current" : "todo")) as [StepState, StepState, StepState];
}
