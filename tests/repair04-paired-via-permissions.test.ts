import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { createCrossingPairInput } from "./fixtures/crossing-pair"
type Replacement = { routeIndex: number; route: HighDensityRoute }
type Candidate = Replacement & { additionalRoutes: Replacement[] }
type Access = { generateCandidates(): Generator<Candidate> }

test("all three replacements require permission before an atomic candidate is scored", (): void => {
  for (const changedPosition of [0, 1, 2]) {
    const input = createCrossingPairInput()
    input.routes.push({
      ...structuredClone(input.routes[1]!),
      connectionName: "c",
    })
    input.lockedPointIndices!.push([true, false, false, true])
    input.allowLayerChanges = false
    input.maxCandidateAttempts = 1
    const moved = structuredClone(input.routes[0]!)
    moved.vias[0]!.x += 0.2
    moved.route[2]!.x += 0.2
    moved.route[3]!.x += 0.2
    const changed: Replacement = { routeIndex: 0, route: moved }
    const unchanged: Replacement = { routeIndex: 1, route: input.routes[1]! }
    const solver = new Repair04Solver(input)
    ;(solver as unknown as Access).generateCandidates =
      function* (): Generator<Candidate> {
        const replacements = [
          unchanged,
          { routeIndex: 2, route: input.routes[2]! },
        ]
        replacements.splice(changedPosition, 0, changed)
        const [first, ...additionalRoutes] = replacements
        yield { ...first!, additionalRoutes }
      }
    solver.solve()
    expect(solver.stats.candidateAttempts).toBe(1)
    expect(solver.stats.candidates).toBe(0)
    expect(solver.stats.accepted).toBe(0)
    expect(solver.getOutput()).toEqual(input.routes)
  }
})
