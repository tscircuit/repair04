import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("copper query windows are rebuilt after negotiation moves a neighboring span", (): void => {
  const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const routes: HighDensityRoute[] = [0, 0.25, -0.25].map(
    (y, index): HighDensityRoute => ({
      connectionName: `route${index}`,
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -1, y, z: 0 },
        { x: 1, y, z: 0 },
      ],
    }),
  )
  const before = structuredClone(routes)
  const result = negotiateTraceClearance({
    srj: {
      bounds,
      layerCount: 1,
      minTraceWidth: 0.1,
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 0.3,
          height: 0.2,
          layers: ["top"],
          connectedTo: ["pad"],
        },
      ],
    },
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (): boolean => true,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 10000,
    maxPathSearchCalls: 20,
  })
  // Captured on the parent: the first detour displaces this neighbor, which
  // must be negotiated against fresh copper rather than the earlier index.
  const expectedNeighbor: RepairRoutePoint[] = [
    routes[1]!.route[0]!,
    { x: -0.825, y: 0.5750000000000002, z: 0, traceThickness: 0.1 },
    { x: -0.725, y: 0.675, z: 0, traceThickness: 0.1 },
    { x: 0.8250000000000002, y: 0.675, z: 0, traceThickness: 0.1 },
    { x: 0.9750000000000001, y: 0.5250000000000001, z: 0, traceThickness: 0.1 },
    routes[1]!.route[1]!,
  ]
  expect(result.routes[1]!.route).toEqual(expectedNeighbor)
  expect(result.routes[2]).toEqual(routes[2])
  expect(result.pathSearchNodes).toBe(1605)
  expect(result.pathSearchCalls).toBe(3)
  expect(result.unresolvedSpanCount).toBe(0)
  expect(routes).toEqual(before)
})
