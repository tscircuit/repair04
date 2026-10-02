import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib"
import { makeTaperedClearanceInput } from "./fixtures/taperedClearanceFixture"

type Access = {
  generateTaperedSegmentCandidates(
    targets: { ri: number; pi: number; distance: number; t: number }[],
  ): Generator<{ routeIndex: number; route: HighDensityRoute }>
}

test("tapered translations cannot alter connectors at the immutable collar", (): void => {
  for (const attachment of [0, 3]) {
    const input = makeTaperedClearanceInput()
    const point = input.routes[0]!.route[attachment]!
    const minY = attachment === 0 ? point.y - 0.8 : point.y + 0.8 - 10
    input.bounds = { ...input.bounds, minY, maxY: minY + 10 }
    input.srj.bounds = input.bounds
    // Both bends remain interior, but the attachment lies on the boundary of
    // the mutable area and must retain the exact original connector geometry.
    const solver = new Repair04Solver(input)
    solver.step()
    expect([
      ...(solver as unknown as Access).generateTaperedSegmentCandidates([
        { ri: 0, pi: 2, distance: 0, t: 0.5 },
      ]),
    ]).toEqual([])
  }
})
