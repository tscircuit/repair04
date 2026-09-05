import { expect, test } from "bun:test"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("clearance search preserves both sides of an attached via while repairing its outgoing span", () => {
  const input = regionSafetyFixture()
  input.routes = [
    {
      connectionName: "signal-net",
      traceThickness: 0.2,
      viaDiameter: 0.6,
      vias: [{ x: -1, y: 0 }],
      route: [
        { x: -4, y: 0, z: 0, pcb_port_id: "start" },
        { x: -1, y: 0, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 4, y: 0, z: 1, pcb_port_id: "end" },
      ],
    },
    {
      connectionName: "attached-branch",
      rootConnectionName: "signal-net",
      traceThickness: 0.2,
      viaDiameter: 0.6,
      vias: [],
      route: [
        { x: -1, y: -3, z: 0, pcb_port_id: "branch" },
        { x: -1, y: 0, z: 0 },
      ],
    },
  ]
  input.srj.obstacles = [
    {
      type: "rect",
      center: { x: 1, y: 0 },
      width: 0.8,
      height: 0.8,
      layers: ["bottom"],
      connectedTo: ["pcb_smtpad_foreign"],
    },
  ]
  const region = extractRepairRegion(input)
  const solver = new Repair04Solver({
    srj: region.srj,
    routes: region.routes,
    bounds: region.bounds,
    boundaryMargin: region.boundaryMargin,
    lockedPointIndices: region.lockedPointIndices,
    maxCandidates: 100,
  })
  solver.solve()
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes: solver.getOutput(),
  })
  const engine = new AutoroutingDrcEngine(input.srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(input.routes, 2)).errors.length,
  ).toBeGreaterThan(0)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(merged, 2)).errors,
  ).toHaveLength(0)
  const points = merged[0]!.route
  const viaIndex = points.findIndex((p) => p.x === -1 && p.y === 0 && p.z === 0)
  expect(viaIndex).toBeGreaterThan(0)
  expect(points[viaIndex + 1]).toEqual({ x: -1, y: 0, z: 1 })
  expect(merged[0]!.vias).toContainEqual({ x: -1, y: 0 })
  expect(points[0]).toEqual(input.routes[0]!.route[0])
  expect(points.at(-1)).toEqual(input.routes[0]!.route.at(-1))
  expect(merged[1]).toEqual(input.routes[1])
})
