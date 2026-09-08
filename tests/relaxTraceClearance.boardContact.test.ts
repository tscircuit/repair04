import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("coupled projection preserves incoming board clearance while opening a via gap", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "via",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [{ x: -1.65, y: 0 }],
      route: [
        { x: -1.2, y: -1, z: 0 },
        { x: -1.65, y: 0, z: 0 },
        { x: -1.65, y: 0, z: 1 },
        { x: -1.2, y: 1, z: 1 },
      ],
    },
    {
      connectionName: "wire",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -1.37, y: -1.5, z: 0 },
        { x: -1.37, y: -0.5, z: 0 },
        { x: -1.37, y: 0.5, z: 0 },
        { x: -1.37, y: 1.5, z: 0 },
      ],
    },
  ]
  const srj: SimpleRouteJson = {
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    obstacles: [],
    connections: [],
    layerCount: 2,
    minTraceWidth: 0.1,
    minViaDiameter: 0.3,
  }
  const original = structuredClone(routes)
  const result = relaxTraceClearance({
    srj,
    routes,
    bounds: srj.bounds,
    boundaryMargin: 0,
    boardEdgeClearance: 0.2,
    lockedPointIndices: routes.map((route) => route.route.map(() => false)),
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowViaMovement: true,
  })
  const via = result[0]!.route[1]!
  expect(via.x - srj.bounds.minX - 0.15).toBeGreaterThanOrEqual(0.2 - 1e-9)
  expect(
    pointToSegmentDistance(
      via,
      result[1]!.route[1]!,
      result[1]!.route[2]!,
    ) - 0.2,
  ).toBeGreaterThanOrEqual(0.1 - 1e-6)
  expect(result[1]!.route[1]!.x).toBeGreaterThan(routes[1]!.route[1]!.x)
  expect(result[0]!.route[2]).toEqual({ ...via, z: 1 })
  for (const [index, route] of result.entries()) {
    expect(route.route[0]).toEqual(original[index]!.route[0])
    expect(route.route.at(-1)).toEqual(original[index]!.route.at(-1))
  }
  expect(routes).toEqual(original)
})
