import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"

test("trace-only repair clears a collision while preserving an unlocked existing via and all fixed contacts", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.2,
    viaDiameter: 0.6,
    route: [
      { x: -8, y: 0, z: 0, pcb_port_id: "outside-start" },
      { x: -1, y: 0, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: 3, y: 0, z: 1, pcb_port_id: "inside-end" },
    ],
    vias: [{ x: -1, y: 0 }],
  }
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    layerCount: 2,
    minTraceWidth: 0.2,
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: 1, y: 0 },
        width: 0.8,
        height: 0.8,
        layers: ["bottom"],
        connectedTo: ["pcb_smtpad_foreign"],
      },
    ],
  }
  const region = extractRepairRegion({ srj, routes: [route], bounds })
  const localBefore = region.routes[0]!
  const viaIndex = localBefore.route.findIndex(
    (point): boolean => point.x === -1 && point.y === 0 && point.z === 0,
  )
  // This via is not an endpoint or junction lock: trace-only mode itself must
  // preserve it. The fragment also crosses the fixed boundary collar.
  expect(region.lockedPointIndices[0]![viaIndex]).toBe(false)
  expect(region.lockedPointIndices[0]![viaIndex + 1]).toBe(false)
  const solver = new Repair04Solver({
    srj: region.srj,
    routes: region.routes,
    bounds: region.bounds,
    boundaryMargin: region.boundaryMargin,
    lockedPointIndices: region.lockedPointIndices,
    allowLayerChanges: false,
    maxCandidates: 512,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  expect(solver.stats.accepted).toBeGreaterThan(0)
  const localAfter = solver.getOutput()[0]!
  const merged = mergeRepairRegion({
    routes: [route],
    region,
    repairedRoutes: solver.getOutput(),
  })
  const engine = new AutoroutingDrcEngine(srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces([route], 2)).errors.length,
  ).toBeGreaterThan(0)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(merged, 2)).errors,
  ).toEqual([])
  expect(merged[0]).not.toEqual(route)
  expect(merged[0]!.viaDiameter).toBe(route.viaDiameter)
  expect(merged[0]!.traceThickness).toBe(route.traceThickness)
  expect(merged[0]!.vias).toEqual(route.vias)
  const transitions = merged[0]!.route.flatMap(
    (point, index): HighDensityRoute["route"][] => {
      const previous = merged[0]!.route[index - 1]
      return previous && previous.z !== point.z ? [[previous, point]] : []
    },
  )
  expect(transitions).toEqual([[route.route[1]!, route.route[2]!]])
  expect(merged[0]!.route[0]).toEqual(route.route[0])
  expect(merged[0]!.route.at(-1)).toEqual(route.route.at(-1))
  expect(localAfter.route.slice(0, viaIndex + 1)).toEqual(
    localBefore.route.slice(0, viaIndex + 1),
  )
  let previousAnchorIndex = -1
  localBefore.route.forEach((point, index): void => {
    if (!region.lockedPointIndices[0]![index]) return
    const anchorIndex = localAfter.route.findIndex(
      (candidate): boolean =>
        JSON.stringify(candidate) === JSON.stringify(point),
    )
    expect(anchorIndex).toBeGreaterThan(previousAnchorIndex)
    previousAnchorIndex = anchorIndex
  })
})
