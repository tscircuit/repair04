import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { createCrossingPairInput } from "./fixtures/crossing-pair"

type Replacement = { routeIndex: number; route: HighDensityRoute }
type Candidate = Replacement & { additionalRoutes: Replacement[] }

test("planar mode rejects via movement in the third route even when layer changes are enabled", (): void => {
  const input = createCrossingPairInput()
  input.routes.push({
    ...structuredClone(input.routes[1]!),
    connectionName: "c",
  })
  input.lockedPointIndices.push([true, false, false, true])
  const moved = structuredClone(input.routes[0]!)
  moved.vias[0]!.x += 0.2
  moved.route[2]!.x += 0.2
  moved.route[3]!.x += 0.2
  const solver = new Repair04Solver(input)
  const access = solver as unknown as {
    generateCandidates(): Generator<Candidate>
    generateCandidatesForMode(allowLayerChanges: boolean): Generator<Candidate>
  }
  const modes: boolean[] = []
  access.generateCandidatesForMode = function* (
    mode: boolean,
  ): Generator<Candidate> {
    modes.push(mode)
    if (!mode)
      yield {
        routeIndex: 1,
        route: input.routes[1]!,
        additionalRoutes: [
          { routeIndex: 2, route: input.routes[2]! },
          { routeIndex: 0, route: moved },
        ],
      }
  }
  expect([...access.generateCandidates()]).toHaveLength(0)
  expect(modes).toEqual([false, true])
})
