import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib"
import { makeTaperedClearanceInput } from "./fixtures/taperedClearanceFixture"

type Access = { generateTaperedSegmentCandidates(targets: { ri: number; pi: number; distance: number; t: number }[]): Generator<{ routeIndex: number; route: HighDensityRoute }> }

test("tapered proposals retain width metadata and cannot move copper into the boundary collar", (): void => {
  const input = makeTaperedClearanceInput()
  // Place the mutable right boundary just beyond the second free bend. Some
  // translations fit; rightward offsets must not cross the immutable collar.
  input.bounds = { ...input.bounds, maxX: input.routes[0]!.route[2]!.x + 0.8 + 0.02 }
  input.bounds.minX = input.bounds.maxX - 10
  input.srj.bounds = input.bounds
  input.routes[0]!.route[3] = { ...input.routes[0]!.route[3]!, x: -1.6 }
  const solver = new Repair04Solver(input)
  solver.step()
  const candidates = [...(solver as unknown as Access).generateTaperedSegmentCandidates([{ ri: 0, pi: 2, distance: 0, t: 0.5 }])]
  expect(candidates.length).toBeGreaterThan(0)
  expect(candidates.length).toBeLessThan(16)
  for (const { route } of candidates) {
    expect(route.route[0]).toEqual(input.routes[0]!.route[0])
    expect(route.route[3]).toEqual(input.routes[0]!.route[3])
    expect(route.vias).toEqual(input.routes[0]!.vias)
    for (const index of [1, 2]) {
      const { x, y, ...metadata } = route.route[index]!
      const { x: _x, y: _y, ...originalMetadata } = input.routes[0]!.route[index]!
      expect(metadata).toEqual(originalMetadata)
      expect(x).toBeLessThan(input.bounds.maxX - input.boundaryMargin)
      expect(x).toBeGreaterThan(input.bounds.minX + input.boundaryMargin)
      expect(y).toBeLessThan(input.bounds.maxY - input.boundaryMargin)
      expect(y).toBeGreaterThan(input.bounds.minY + input.boundaryMargin)
    }
  }
})
