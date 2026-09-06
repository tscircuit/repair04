import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"
type Candidate = { routeIndex: number; route: HighDensityRoute }
type Access = {
  generateCandidates(): Generator<Candidate>
  generateClearanceCandidates(
    targets: { ri: number; pi: number; distance: number; t: number }[],
    allowLayerChanges: boolean,
  ): Generator<Candidate>
}

test("explicit work completion flushes a validated deferred equal-count improvement", (): void => {
  const input = makeBudgetInput([
    makeBudgetRoute("a", [
      [-1, 0],
      [0, 0],
      [1, 0],
    ]),
    makeBudgetRoute("b", [
      [-2, 1],
      [0, 0.12],
      [2, 1],
    ]),
  ])
  const improved = makeBudgetRoute("a", [
    [-1, 0],
    [0, -0.02],
    [1, 0],
  ])
  for (const limit of ["attempt", "nodes"]) {
    const solver = new Repair04Solver({
      ...input,
      ...(limit === "attempt"
        ? { maxCandidateAttempts: 1 }
        : { maxPathSearchNodes: 1 }),
    })
    const access = solver as unknown as Access
    access.generateCandidates = function* (): Generator<Candidate> {
      yield { routeIndex: 0, route: improved }
      if (limit === "attempt") throw Error("budget must stop sweep")
      yield* access.generateClearanceCandidates(
        [{ ri: 0, pi: 1, distance: 0, t: 0.5 }],
        false,
      )
    }
    solver.step()
    expect(solver.stats.accepted).toBe(0)
    expect(solver.solved).toBe(false)
    solver.step()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    expect(solver.stats.completionReason).toBe(
      limit === "attempt"
        ? "candidate-attempt-limit"
        : "path-search-node-limit",
    )
    expect(solver.stats.candidateAttempts).toBe(1)
    expect(solver.stats.accepted).toBe(1)
    expect(solver.stats.pathSearchNodes).toBe(limit === "attempt" ? 0 : 1)
    expect(solver.stats.finalErrorCount).toBe(solver.stats.initialErrorCount)
    expect(solver.getOutput()[0]).toEqual(improved)
  }
})
