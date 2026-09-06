import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  createNewViaPadViolationEvaluator,
  getNewViaPadViolations,
} from "../lib/getNewViaPadViolations"

test("reused physical contacts retain current ownership, via ordinal, span, diameter and independent output objects", (): void => {
  const srj: SimpleRouteJson = {
    layerCount: 4,
    minTraceWidth: 0.1,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.4,
        height: 0.4,
        layers: ["top"],
        connectedTo: ["signal"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.8,
        height: 0.8,
        ccwRotationDegrees: 45,
        layers: ["inner2"],
        connectedTo: ["other"],
      },
    ],
  }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 4, y: 0, z: 1 },
    ],
  }
  const evaluate = createNewViaPadViolationEvaluator({ srj })
  const selected = [{ routeIndex: 0, viaIndex: 0 }]
  const first = evaluate({
    routes: [route],
    previousRoutes: [route],
    includeExistingVias: selected,
  })
  expect(first.map((v) => [v.key, v.severity])).toEqual([
    ["new-via-pad:0:0:0", 0.25],
  ])
  first[0]!.center.x = 999
  first[0]!.severity = 999
  const copy = structuredClone(route)
  expect(
    evaluate({
      routes: [copy],
      previousRoutes: [copy],
      includeExistingVias: selected,
    })[0],
  ).toMatchObject({ center: { x: 0, y: 0 }, severity: 0.25 })
  expect(evaluate({ routes: [copy], previousRoutes: [copy] })).toEqual([])
  const renamed = { ...copy, connectionName: "other-owner" }
  expect(
    evaluate({ routes: [renamed], previousRoutes: [copy] }).map((v) => v.key),
  ).toEqual(["new-via-pad:0:0:0"])
  const extra: HighDensityRoute = {
    ...copy,
    route: [
      { x: -4, y: 0, z: 1 },
      { x: -2, y: 0, z: 1 },
      { x: -2, y: 0, z: 0 },
      ...copy.route.slice(1),
    ],
  }
  expect(
    evaluate({
      routes: [copy, extra],
      previousRoutes: [copy, extra],
      includeExistingVias: [{ routeIndex: 1, viaIndex: 1 }],
    }).map((v) => v.key),
  ).toEqual(["new-via-pad:1:0:1"])
  const wider = { ...copy, viaDiameter: 0.6 }
  expect(
    evaluate({ routes: [wider], previousRoutes: [copy] })[0]!.severity,
  ).toBe(0.4)
  const lower = {
    ...copy,
    route: copy.route.map((p) => ({ ...p, z: p.z + 2 })),
  }
  expect(
    evaluate({ routes: [lower], previousRoutes: [copy] }).map((v) => v.key),
  ).toEqual(["new-via-pad:0:1:0"])
  const shifted = {
    ...copy,
    route: copy.route.map((p) => ({ ...p, x: p.x + 1 })),
  }
  expect(evaluate({ routes: [shifted], previousRoutes: [copy] })).toEqual([])
  srj.obstacles[0]!.center.x = 3
  expect(
    evaluate({
      routes: [copy],
      previousRoutes: [copy],
      includeExistingVias: selected,
    }),
  ).toHaveLength(1)
  expect(
    getNewViaPadViolations({
      srj,
      routes: [copy],
      previousRoutes: [copy],
      includeExistingVias: selected,
    }),
  ).toEqual([])
})
