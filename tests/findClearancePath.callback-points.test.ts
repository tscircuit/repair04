import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test("clearance cost callbacks can retain point references throughout a search", (): void => {
  const task = createPairedClearanceTask("detour", 2000)
  const retained = new Map<RepairRoutePoint, RepairRoutePoint>()
  let calls = 0
  const solver = new FindClearancePathSolver({
    ...task.pathInput,
    getAdditionalEdgeCost: (a, b): number => {
      calls++
      for (const point of [a, b]) {
        const previous = retained.get(point)
        if (previous) expect(point).toEqual(previous)
        else retained.set(point, { ...point })
      }
      return 0
    },
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).not.toBeNull()
  expect(calls).toBeGreaterThan(16)
  expect(retained.size).toBeGreaterThan(16)
  for (const [point, snapshot] of retained) expect(point).toEqual(snapshot)
})
