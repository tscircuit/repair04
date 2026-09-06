import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"

test("distance pruning retains invalid-geometry failures and rotated copper clearance at the tolerance boundary", (): void => {
  const route: HighDensityRoute = {
    connectionName: "a",
    traceThickness: 0.2,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.2,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 100, y: 100 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["foreign"],
      },
    ],
  }
  const previous = { ...route, route: [] }
  expect(getFixedObstacleViolations({ srj, routes: [route] })).toEqual([])
  expect(
    getNewViaPadViolations({
      srj,
      routes: [route],
      previousRoutes: [previous],
    }),
  ).toEqual([])
  expect(() =>
    getFixedObstacleViolations({
      srj,
      routes: [{ ...route, route: [route.route[0]!, { x: 1, y: 0, z: 1 }] }],
    }),
  ).toThrow("non-colocated")
  const invalid = structuredClone(srj)
  invalid.obstacles[0]!.width = -1
  expect(() =>
    getFixedObstacleViolations({ srj: invalid, routes: [route] }),
  ).toThrow("finite and nonnegative")
  expect(() =>
    getNewViaPadViolations({
      srj: invalid,
      routes: [route],
      previousRoutes: [previous],
    }),
  ).toThrow("invalid obstacle geometry")
  invalid.obstacles[0]!.width = 1
  invalid.obstacles[0]!.layers = ["unknown"]
  expect(() =>
    getNewViaPadViolations({
      srj: invalid,
      routes: [route],
      previousRoutes: [previous],
    }),
  ).toThrow("unknown obstacle layer")
  const rotated = structuredClone(srj)
  rotated.obstacles[0] = {
    ...rotated.obstacles[0]!,
    center: { x: 0, y: 0 },
    width: 2,
    height: 0.2,
    ccwRotationDegrees: 45,
  }
  const point = {
    x: (1 + 0.25 - 2e-8) / Math.sqrt(2),
    y: (1 + 0.25 - 2e-8) / Math.sqrt(2),
  }
  const touching = {
    ...route,
    route: [
      { ...point, z: 0 },
      { ...point, z: 1 },
    ],
  }
  expect(
    getFixedObstacleViolations({ srj: rotated, routes: [touching] }),
  ).toHaveLength(1)
  expect(
    getNewViaPadViolations({
      srj: rotated,
      routes: [touching],
      previousRoutes: [previous],
    }),
  ).toHaveLength(1)
})
