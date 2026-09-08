import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import { relaxTraceClearance } from "../lib"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { makeTaperedPolylineInput } from "./fixtures/taperedClearanceFixture"

test("clearance projection retains taper widths and the fixed pad contacts", (): void => {
  const input = makeTaperedPolylineInput()
  const output = relaxTraceClearance(input)[0]!
  const before = input.routes[0]!
  expect(output.route[0]).toEqual(before.route[0])
  expect(output.route.at(-1)).toEqual(before.route.at(-1))
  expect(output.route.map((point) => (point as RepairRoutePoint).traceThickness))
    .toEqual(before.route.map((point) => (point as RepairRoutePoint).traceThickness))
  const obstacle = input.srj.obstacles[0]!
  const bounds = { minX: obstacle.center.x - obstacle.width / 2, maxX: obstacle.center.x + obstacle.width / 2,
    minY: obstacle.center.y - obstacle.height / 2, maxY: obstacle.center.y + obstacle.height / 2 }
  for (let i = 1; i < output.route.length; i++) {
    const a = output.route[i - 1]! as RepairRoutePoint, b = output.route[i]! as RepairRoutePoint
    const clearance = segmentToBoundsMinDistance(a, b, bounds) - Math.max(a.traceThickness!, b.traceThickness!) / 2
    expect(clearance).toBeGreaterThanOrEqual(0.1 - 1e-7)
  }
})
