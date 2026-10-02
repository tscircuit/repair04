import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"

test("indexed contact ownership keeps unrelated copper from consuming a bounded repair search", (): void => {
  const routes: HighDensityRoute[] = Array.from(
    { length: 13 },
    (_, index): HighDensityRoute => ({
      connectionName: index === 12 ? "signal" : "healthy",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -1, y: 0, z: index === 12 ? 0 : 1 },
        { x: 1, y: 0, z: index === 12 ? 0 : 1 },
      ],
    }),
  )
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.1,
    connections: ["signal", "healthy"].map(
      (name): SimpleRouteJson["connections"][number] => ({
        name,
        pointsToConnect: [],
      }),
    ),
    obstacles: [
      {
        type: "rect",
        width: 0.3,
        height: 0.3,
        center: { x: 0, y: 0 },
        layers: ["top"],
        connectedTo: ["pcb_smtpad_foreign"],
      },
    ],
  }
  const region = extractRepairRegion({ srj, routes, bounds })
  const solver = new Repair04Solver({
    ...region,
    maxCandidates: 12,
    maxCandidateAttempts: 12,
    maxPathSearchNodes: 10000,
  })
  solver.solve()
  const result = mergeRepairRegion({
    routes,
    region,
    repairedRoutes: solver.getOutput(),
  })
  const engine = new AutoroutingDrcEngine(srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(routes, 2)).errors,
  ).toHaveLength(1)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(result, 2)).errors,
  ).toHaveLength(0)
  expect(result.slice(0, 12)).toEqual(routes.slice(0, 12))
  const signal = result[12]!
  expect(signal.route[0]).toEqual(routes[12]!.route[0])
  expect(signal.route.at(-1)).toEqual(routes[12]!.route.at(-1))
  for (let index = 1; index < signal.route.length; index++) {
    expect(
      segmentToBoundsMinDistance(
        signal.route[index - 1]!,
        signal.route[index]!,
        { minX: -0.15, maxX: 0.15, minY: -0.15, maxY: 0.15 },
      ) -
        signal.traceThickness / 2,
    ).toBeGreaterThanOrEqual(0.1)
  }
})
