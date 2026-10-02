import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import { Repair04Solver, convertRepairRoutesToTraces } from "../lib"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { makeTaperedPolylineInput } from "./fixtures/taperedClearanceFixture"

test("a tapered polyline moves as a group with actual pad clearance above0.1mm", (): void => {
  const input = makeTaperedPolylineInput()
  const original = structuredClone(input.routes[0]!)
  const solver = new Repair04Solver({ ...input, maxCandidateAttempts: 16 })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.finalErrorCount).toBe(0)
  expect(solver.stats.pathSearchCalls).toBe(0)
  const output = solver.getOutput()[0]!
  expect(output.route).toHaveLength(6)
  expect(output.route[0]).toEqual(original.route[0])
  expect(output.route[5]).toEqual(original.route[5])
  expect(output.vias).toEqual(original.vias)
  const pad = input.srj.obstacles[0]!
  const bounds = {
    minX: pad.center.x - pad.width / 2,
    maxX: pad.center.x + pad.width / 2,
    minY: pad.center.y - pad.height / 2,
    maxY: pad.center.y + pad.height / 2,
  }
  let minimumGap = Infinity
  for (let i = 1; i < output.route.length; i++) {
    const a = output.route[i - 1]! as RepairRoutePoint
    const b = output.route[i]! as RepairRoutePoint
    const width = Math.max(a.traceThickness!, b.traceThickness!)
    minimumGap = Math.min(
      minimumGap,
      segmentToBoundsMinDistance(a, b, bounds) - width / 2,
    )
    expect(b.traceThickness).toBe(
      (original.route[i]! as RepairRoutePoint).traceThickness,
    )
  }
  expect(minimumGap).toBeGreaterThan(0.1)
  expect(
    new AutoroutingDrcEngine(input.srj).evaluate(
      convertRepairRoutesToTraces([output], 2),
    ).errors,
  ).toEqual([])
})
