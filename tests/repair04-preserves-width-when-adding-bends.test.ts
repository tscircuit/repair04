import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { Repair04Solver } from "../lib/Repair04Solver"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("a new repair bend retains copper width instead of resolving DRC by narrowing", () => {
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [{ name: "wide-signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["pcb_smtpad_foreign"],
      },
    ],
  }
  const points: RepairRoutePoint[] = [
    { x: -4, y: 0.6, z: 0, traceThickness: 0.5 },
    { x: 4, y: 0.6, z: 0, traceThickness: 0.5 },
  ]
  const route: HighDensityRoute = {
    connectionName: "wide-signal",
    traceThickness: 0.1,
    viaDiameter: 0.6,
    vias: [],
    route: points,
  }
  const engine = new AutoroutingDrcEngine(srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces([route], 2)).errors.length,
  ).toBeGreaterThan(0)
  const solver = new Repair04Solver({
    srj,
    routes: [route],
    bounds: srj.bounds,
    boundaryMargin: 0.5,
    lockedPointIndices: [[true, true]],
    maxCandidates: 2000,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  const output = solver.getOutput()
  expect(output[0]!.route.length).toBeGreaterThan(points.length)
  expect(output[0]!.route[0]).toEqual(points[0])
  expect(output[0]!.route.at(-1)).toEqual(points.at(-1))
  const converted = convertRepairRoutesToTraces(output, 2)
  expect(
    converted[0]!.route
      .filter((point) => point.route_type === "wire")
      .every((point) => point.width === 0.5),
  ).toBe(true)
  expect(engine.evaluate(converted).errors).toEqual([])
})
