import { expect, spyOn, test } from "bun:test"
import Flatbush from "flatbush"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("nearby clearance edges reuse copper searches without changing the path or work budget", (): void => {
  const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const routes: HighDensityRoute[] = [0, 0.2 - 1e-6, 0.4].map(
    (y, index): HighDensityRoute => ({
      connectionName: `signal-${index}`,
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: index === 0 ? -0.8 : -0.4, y, z: 0 },
        { x: index === 0 ? 0.8 : 0.4, y, z: 0 },
      ],
    }),
  )
  const before = structuredClone(routes)
  const search = spyOn(Flatbush.prototype, "search")
  let result: ReturnType<typeof negotiateTraceClearance>
  let searches: number
  try {
    result = negotiateTraceClearance({
      srj: {
        bounds,
        layerCount: 2,
        minTraceWidth: 0.1,
        connections: [],
        obstacles: [],
      },
      routes,
      bounds,
      dirtyRouteIndices: [0],
      isLocked: (): boolean => false,
      allowLayerChanges: false,
      traceClearance: 0.1,
      viaClearance: 0.1,
      maxPathSearchNodes: 34,
      maxPathSearchCalls: 2,
    })
    searches = search.mock.calls.length
  } finally {
    search.mockRestore()
  }
  // Exact output and heap-pop count captured before query-window reuse.
  const expected: RepairRoutePoint[] = [
    routes[0]!.route[0]!,
    { x: 0.675, y: -0.02499999999999991, z: 0, traceThickness: 0.1 },
    routes[0]!.route[1]!,
  ]
  expect(result.routes[0]!.route).toEqual(expected)
  expect(result.routes.slice(1)).toEqual(routes.slice(1))
  expect(result.pathSearchNodes).toBe(34)
  expect(result.pathSearchCalls).toBe(1)
  expect(result.unresolvedSpanCount).toBe(0)
  expect(routes).toEqual(before)
  expect(searches).toBe(48)
})
