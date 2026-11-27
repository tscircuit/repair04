import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"

test("a preserved shared via leaves redundant wire contacts movable", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const routes: HighDensityRoute[] = [-1, 1].map((side, index) => ({
    connectionName: `branch-${index}`,
    rootConnectionName: "shared-net",
    traceThickness: 0.1,
    viaDiameter: 0.4,
    vias: [{ x: -2, y: 0 }],
    route: [
      { x: -3, y: side, z: 0 },
      { x: -2, y: 0, z: 0 },
      { x: -2, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 3, y: 2 * side, z: 1 },
    ],
  }))
  const input = {
    srj: { layerCount: 2, minTraceWidth: 0.1, bounds, obstacles: [], connections: [] },
    routes,
    bounds,
    boundaryMargin: 0.1,
  }
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  for (const [routeIndex, route] of repairedRoutes.entries()) {
    const bendIndex = route.route.findIndex(point => point.x === 2 && point.y === 0)
    expect(bendIndex).toBeGreaterThan(-1)
    expect(region.lockedPointIndices[routeIndex]![bendIndex]).toBe(false)
    route.route[bendIndex]!.y = 0.5
    for (const [pointIndex, point] of route.route.entries()) {
      if (point.x === -2 && point.y === 0) {
        expect(region.lockedPointIndices[routeIndex]![pointIndex]).toBe(true)
      }
    }
  }
  const merged = mergeRepairRegion({ routes, region, repairedRoutes })
  for (const [index, route] of merged.entries()) {
    expect(route.vias).toEqual(routes[index]!.vias)
    expect(route.route[0]).toEqual(routes[index]!.route[0])
    expect(route.route.at(-1)).toEqual(routes[index]!.route.at(-1))
  }
  const movedVia = structuredClone(region.routes)
  for (const point of movedVia[0]!.route) if (point.x === -2) point.y = 1
  expect(() => mergeRepairRegion({ routes, region, repairedRoutes: movedVia })).toThrow("locked point")
})
