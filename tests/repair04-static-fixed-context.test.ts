import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  createFixedObstacleViolationEvaluator,
  getFixedObstacleViolations,
} from "../lib/getFixedObstacleViolations"

test("static fixed context preserves aliases, ordered geometry checks and lazy validation while isolating caller mutations", (): void => {
  const shared: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "root",
    traceThickness: 0.2,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 4, y: 0, z: 1 },
    ],
  }
  const alias: HighDensityRoute = {
    ...shared,
    connectionName: "root",
    rootConnectionName: "pad-alias",
    route: [],
    vias: [],
  }
  const routes = [shared, shared, alias]
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.2,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.5,
        height: 0.5,
        layers: ["top", "bottom"],
        connectedTo: ["foreign"],
      },
      {
        type: "rect",
        center: { x: 1, y: 0 },
        width: 0.5,
        height: 0.5,
        ccwRotationDegrees: 35,
        layers: ["bottom"],
        connectedTo: ["pcb_port_rotated"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["pad-alias"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["pcb_port_axis"],
      },
    ],
  }
  const originalSrj = structuredClone(srj),
    originalRoutes = structuredClone(routes)
  const evaluate = createFixedObstacleViolationEvaluator({ srj, routes })
  const before = evaluate(routes)
  expect(before.map((v) => v.key)).toEqual([
    "fixed-obstacle:0:0:wire",
    "fixed-obstacle:0:0:via",
    "fixed-obstacle:1:0:wire",
    "fixed-obstacle:1:0:via",
    "fixed-obstacle:0:1:wire",
    "fixed-obstacle:1:1:wire",
  ])
  for (const y of [0, 0.2, 0.8, -1, 0]) {
    const candidate = [
      shared,
      {
        ...shared,
        route: shared.route.map((p) => ({ ...p, y })),
        vias: [{ x: 0, y }],
      },
      alias,
    ]
    expect(evaluate(candidate)).toEqual(
      getFixedObstacleViolations({ srj, routes: candidate }),
    )
  }
  // Geometry-empty aliases must still union signal and pad ownership.
  expect(before.some((v) => v.obstacleIndex === 2)).toBe(false)
  expect(before.some((v) => v.obstacleIndex === 3)).toBe(false)
  before[0]!.severity = 100
  before[0]!.center.x = 100
  expect(evaluate(originalRoutes)).toEqual(
    getFixedObstacleViolations({ srj: originalSrj, routes: originalRoutes }),
  )
  srj.obstacles[0]!.center.x = 100
  srj.obstacles[0]!.connectedTo.push("signal")
  alias.rootConnectionName = "changed"
  expect(evaluate(originalRoutes)).toEqual(
    getFixedObstacleViolations({ srj: originalSrj, routes: originalRoutes }),
  )
  expect(
    getFixedObstacleViolations({ srj, routes: originalRoutes }),
  ).not.toEqual(evaluate(originalRoutes))

  const invalid = structuredClone(originalSrj)
  invalid.obstacles[1]!.width = -1
  const lazy = createFixedObstacleViolationEvaluator({
    srj: invalid,
    routes: originalRoutes,
  })
  const badRoute = {
    ...shared,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ],
  }
  expect(() => lazy([badRoute, shared, originalRoutes[2]!])).toThrow(
    "non-colocated via transition",
  )
  expect(() => lazy(originalRoutes)).toThrow(
    "fixed obstacle geometry must be finite and nonnegative",
  )
  expect(() => lazy([badRoute, shared, originalRoutes[2]!])).toThrow(
    "non-colocated via transition",
  )

  const axisOnly = { ...originalSrj, obstacles: [originalSrj.obstacles[3]!] }
  const empty = createFixedObstacleViolationEvaluator({
    srj: axisOnly,
    routes: originalRoutes,
  })
  expect(empty(originalRoutes)).toEqual([])
  expect(empty([badRoute, shared, originalRoutes[2]!])).toEqual(
    getFixedObstacleViolations({
      srj: axisOnly,
      routes: [badRoute, shared, originalRoutes[2]!],
    }),
  )
  const invalidLayer = structuredClone(originalSrj)
  invalidLayer.obstacles[0]!.layers = ["unknown"]
  const unknown = createFixedObstacleViolationEvaluator({
    srj: invalidLayer,
    routes: originalRoutes,
  })
  expect(() => unknown(originalRoutes)).toThrow("unknown layer")
  expect(() => unknown(originalRoutes)).toThrow("unknown layer")
})
