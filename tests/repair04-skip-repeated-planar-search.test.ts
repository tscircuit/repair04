import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  convertRepairRoutesToTraces,
  extractRepairRegion,
  getNewViaPadViolations,
  mergeRepairRegion,
} from "../lib"

test("skipping a repeated planar phase preserves layer permission and guarded via clearance", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -8, y: 0, z: 0, pcb_port_id: "start" },
      { x: 0, y: 0, z: 0 },
      { x: 8, y: 0, z: 0, pcb_port_id: "end" },
    ],
    vias: [],
  }
  const srj: SimpleRouteJson = {
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    layerCount: 2,
    minTraceWidth: 0.15,
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect", center: { x: 0, y: 0 }, width: 0.5, height: 14,
        layers: ["top"], connectedTo: ["pcb_smtpad_foreign", "foreign-net"],
      },
      {
        type: "rect", center: { x: -3, y: 0 }, width: 0.5, height: 0.5,
        layers: ["top"], connectedTo: ["signal", "pcb_smtpad_own"],
      },
    ],
  }
  const region = extractRepairRegion({
    srj, routes: [route], bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  })
  const engine = new AutoroutingDrcEngine(srj)
  expect(engine.evaluate(convertRepairRoutesToTraces([route], 2)).errors.length).toBeGreaterThan(0)
  const planar = new Repair04Solver({
    ...region, allowLayerChanges: false, traceOnlyFirst: false, maxCandidates: 4,
  })
  planar.solve()
  expect(planar.failed).toBe(false)
  expect(planar.getOutput()[0]!.vias).toEqual([])
  expect(planar.getOutput()[0]!.route.every((point): boolean => point.z === 0)).toBe(true)
  expect(planar.stats.finalErrorCount).toBeGreaterThan(0)

  const defaultOrder = new Repair04Solver({
    ...region, allowLayerChanges: true, maxCandidates: 4,
  })
  defaultOrder.solve()
  expect(defaultOrder.failed).toBe(false)
  expect(defaultOrder.stats.finalErrorCount).toBe(0)

  // The explicit flag reaches a valid bridge with its first evaluated proposal;
  // the unchanged default first spends a proposal on the blocked planar route.
  const advanced = new Repair04Solver({
    ...region, allowLayerChanges: true, traceOnlyFirst: false, maxCandidates: 4,
  })
  advanced.solve()
  expect(advanced.failed).toBe(false)
  expect(advanced.stats.candidates).toBe(1)
  expect(defaultOrder.stats.candidates).toBeGreaterThan(advanced.stats.candidates as number)
  expect(advanced.stats.finalErrorCount).toBe(0)
  const output = advanced.getOutput()
  expect(output[0]!.vias.length).toBeGreaterThan(0)
  expect(getNewViaPadViolations({ srj: region.srj, previousRoutes: region.routes, routes: output })).toEqual([])
  const merged = mergeRepairRegion({ routes: [route], region, repairedRoutes: output })
  expect(engine.evaluate(convertRepairRoutesToTraces(merged, 2)).errors).toEqual([])
  expect(merged[0]!.route[0]).toEqual(route.route[0])
  expect(merged[0]!.route.at(-1)).toEqual(route.route.at(-1))
  expect(merged[0]!.traceThickness).toBe(route.traceThickness)
  expect(merged[0]!.viaDiameter).toBe(route.viaDiameter)
})
