import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("negotiated clearance moves neighboring tracks to open a blocked pad escape", (): void => {
  const bounds = { minX: -4.5, maxX: 4.5, minY: -4.5, maxY: 4.5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.6,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["pad"],
      },
    ],
  }
  const routes: HighDensityRoute[] = [0, 0.35, -0.35].map(
    (y, index): HighDensityRoute => ({
      connectionName: `route${index}`,
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -4.5, y, z: 0 },
        { x: 4.5, y, z: 0 },
      ],
    }),
  )
  const before = structuredClone(routes)
  expect(
    findClearancePath({
      srj,
      routes,
      routeIndex: 0,
      start: routes[0]!.route[0]!,
      end: routes[0]!.route[1]!,
      bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.1,
      gridSize: 0.05,
      allowLayerChanges: false,
      maxNodes: 120000,
    }),
  ).toBeNull()
  const result = negotiateTraceClearance({
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (): boolean => true,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 120000,
    maxPathSearchCalls: 256,
  })
  const engine = new AutoroutingDrcEngine(srj, {
    traceClearance: 0.1,
    viaClearance: 0.1,
  })
  expect(
    engine.evaluate(convertRepairRoutesToTraces(result.routes, 1)).errors,
  ).toHaveLength(0)
  expect(
    getFixedObstacleViolations({ srj, routes: result.routes }),
  ).toHaveLength(0)
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: routes,
      routes: result.routes,
    }),
  ).toHaveLength(0)
  expect(result.pathSearchNodes).toBeLessThanOrEqual(120000)
  expect(result.pathSearchCalls).toBeLessThanOrEqual(256)
  expect(result.pathSearchCalls).toBeGreaterThan(1)
  expect(
    result.routes[1]!.route.length + result.routes[2]!.route.length,
  ).toBeGreaterThan(4)
  expect(routes).toEqual(before)
  for (let index = 0; index < routes.length; index++) {
    expect(result.routes[index]!.route[0]).toEqual(routes[index]!.route[0])
    expect(result.routes[index]!.route.at(-1)).toEqual(
      routes[index]!.route.at(-1),
    )
    expect(result.routes[index]!.vias).toEqual([])
  }
})
