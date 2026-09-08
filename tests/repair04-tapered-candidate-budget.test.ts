import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { makeTaperedClearanceInput } from "./fixtures/taperedClearanceFixture"

type Target = { ri: number; pi: number; distance: number; t: number }
type Access = {
  generateTaperedSegmentCandidates(
    targets: Target[],
  ): Generator<{ routeIndex: number; route: HighDensityRoute }>
}

test("tapered candidate work is deduplicated and bounded while uniform widths keep their search order", (): void => {
  const input = makeTaperedClearanceInput()
  const route = input.routes[0]!
  input.routes = Array.from(
    { length: 12 },
    (): HighDensityRoute => structuredClone(route),
  )
  input.lockedPointIndices = input.routes.map((): boolean[] => [
    true,
    false,
    false,
    true,
  ])
  const solver = new Repair04Solver(input)
  solver.step()
  const targets = input.routes.flatMap((_route, ri): Target[] =>
    Array.from(
      { length: 3 },
      (): Target => ({ ri, pi: 2, distance: 0, t: 0.5 }),
    ),
  )
  const candidates = [
    ...(solver as unknown as Access).generateTaperedSegmentCandidates(targets),
  ]
  expect(candidates).toHaveLength(128)
  expect(
    new Set(candidates.map((candidate): number => candidate.routeIndex)).size,
  ).toBe(8)
  expect(
    new Set(candidates.map((candidate): string => JSON.stringify(candidate)))
      .size,
  ).toBe(128)

  const uniform = makeTaperedClearanceInput()
  for (const point of uniform.routes[0]!.route as RepairRoutePoint[])
    point.traceThickness = 0.2
  const unchanged = new Repair04Solver(uniform)
  unchanged.step()
  expect([
    ...(unchanged as unknown as Access).generateTaperedSegmentCandidates([
      { ri: 0, pi: 2, distance: 0, t: 0.5 },
    ]),
  ]).toEqual([])
})
