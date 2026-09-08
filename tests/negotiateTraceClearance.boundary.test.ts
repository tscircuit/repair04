import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("negotiation preserves border copper and cannot shortcut through the fixed collar", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -6, y: -4.5, z: 0 },
        { x: -3, y: -4.5, z: 0 },
        { x: 0, y: -3, z: 0 },
        { x: 3, y: -4.5, z: 0 },
        { x: 6, y: -4.5, z: 0 },
      ],
    },
  ]
  const region = extractRepairRegion({
    srj,
    routes,
    bounds,
    boundaryMargin: 0.5,
  })
  const result = negotiateTraceClearance({
    srj: region.srj,
    routes: region.routes,
    bounds: region.mutableBounds,
    dirtyRouteIndices: [0],
    isLocked: (ri, pi): boolean => region.lockedPointIndices[ri]![pi]!,
    allowLayerChanges: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 30000,
    maxPathSearchCalls: 16,
  })
  const merged = mergeRepairRegion({
    routes,
    region,
    repairedRoutes: result.routes,
  })
  expect(merged[0]!.route[0]).toEqual(routes[0]!.route[0])
  expect(merged[0]!.route.at(-1)).toEqual(routes[0]!.route.at(-1))
  expect(merged[0]!.route.some((point): boolean => point.y > -4.5)).toBe(true)
  expect(result.pathSearchCalls).toBeGreaterThan(0)
})
