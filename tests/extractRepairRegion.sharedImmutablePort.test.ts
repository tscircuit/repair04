import { expect, test } from "bun:test"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("repairs redundant same-net overlaps while connectivity remains fixed at a shared original port", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.traceThickness = 0.15
  input.routes[0]!.route = [
    { x: -3, y: 1, z: 0, pcb_port_id: "left-port" },
    { x: 0, y: 0.6, z: 0 },
    { x: 3, y: 1, z: 0, pcb_port_id: "shared-port" },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "second-branch",
    rootConnectionName: "signal-net",
    route: [
      { x: -3, y: 2, z: 0, pcb_port_id: "upper-port" },
      { x: 0, y: 0.6, z: 0 },
      { x: 3, y: 1, z: 0, pcb_port_id: "shared-port" },
    ],
  }
  input.srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 1,
      height: 1,
      layers: ["top"],
      connectedTo: ["pcb_smtpad_foreign"],
    },
  ]
  const region = extractRepairRegion(input)
  expect(region.lockedPointIndices).toEqual([
    [true, false, true],
    [true, false, true],
  ])
  const solver = new Repair04Solver({
    srj: region.srj,
    routes: region.routes,
    bounds: region.bounds,
    boundaryMargin: region.boundaryMargin,
    lockedPointIndices: region.lockedPointIndices,
    maxCandidates: 1000,
  })
  solver.solve()
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes: solver.getOutput(),
  })
  const engine = new AutoroutingDrcEngine(input.srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(input.routes, 2)).errors,
  ).toHaveLength(2)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(merged, 2)).errors,
  ).toHaveLength(0)
  for (let index = 0; index < 2; index += 1) {
    expect(merged[index]!.route[0]).toEqual(input.routes[index]!.route[0])
    expect(merged[index]!.route.at(-1)).toEqual(
      input.routes[index]!.route.at(-1),
    )
    expect(merged[index]!.traceThickness).toBe(0.15)
  }
})
