import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { createNewViaPadViolationEvaluator } from "../lib/getNewViaPadViolations"

test("static preparation preserves lazy obstacle validation and route validation on every call", (): void => {
  const srj: SimpleRouteJson = {
    layerCount: 4,
    minTraceWidth: 0.1,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 100, y: 100 },
        width: -1,
        height: 1,
        layers: ["inner2"],
        connectedTo: ["pad"],
      },
    ],
  }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
  }
  const selected = [{ routeIndex: 0, viaIndex: 0 }]
  const evaluate = createNewViaPadViolationEvaluator({ srj })
  expect(evaluate({ routes: [], previousRoutes: [] })).toEqual([])
  expect(
    evaluate({
      routes: [route],
      previousRoutes: [route],
      includeExistingVias: selected,
    }),
  ).toEqual([])
  const deep = {
    ...route,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
    ],
  }
  expect(() => evaluate({ routes: [deep], previousRoutes: [route] })).toThrow(
    "invalid obstacle geometry",
  )
  expect(
    evaluate({
      routes: [route],
      previousRoutes: [route],
      includeExistingVias: selected,
    }),
  ).toEqual([])
  expect(() => evaluate({ routes: [route], previousRoutes: [] })).toThrow(
    "matching route ordering",
  )
  const invalid = {
    ...route,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ],
  }
  expect(() =>
    evaluate({ routes: [invalid], previousRoutes: [route] }),
  ).toThrow("valid colocated vias")
  srj.obstacles[0]!.layers = ["unknown"]
  const unknownLayer = createNewViaPadViolationEvaluator({ srj })
  expect(unknownLayer({ routes: [route], previousRoutes: [route] })).toEqual([])
  expect(() =>
    unknownLayer({
      routes: [route],
      previousRoutes: [route],
      includeExistingVias: selected,
    }),
  ).toThrow("unknown obstacle layer")
  const badMargin = createNewViaPadViolationEvaluator({
    srj,
    viaClearance: Number.NaN,
  })
  expect(() => badMargin({ routes: [route], previousRoutes: [] })).toThrow(
    "matching route ordering",
  )
  expect(() => badMargin({ routes: [], previousRoutes: [] })).toThrow(
    "nonnegative finite margins",
  )
})
