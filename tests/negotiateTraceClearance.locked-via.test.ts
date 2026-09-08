import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("a lock on either end of a via fixes the complete transition during negotiation", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = { bounds, layerCount: 2, minTraceWidth: 0.1,
    connections: [], obstacles: [{ type: "rect", center: { x: 0, y: 0 },
      width: 0.2, height: 0.2, layers: ["top", "bottom"], connectedTo: ["fixed"] }] }
  const routes: HighDensityRoute[] = [{ connectionName: "signal", traceThickness: 0.1,
    viaDiameter: 0.3, vias: [{ x: 0, y: 0 }], route: [
      { x: -3, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 3, y: 0, z: 1 },
    ] }]
  for (const locked of [1, 2]) {
    const result = negotiateTraceClearance({ srj, routes, bounds, dirtyRouteIndices: [0],
      isLocked: (_ri, pi): boolean => pi === locked,
      allowLayerChanges: true, traceClearance: 0.1, viaClearance: 0.1,
      maxPathSearchNodes: 30000, maxPathSearchCalls: 16 })
    expect(result.routes).toEqual(routes)
    expect(result.unresolvedSpanCount).toBeGreaterThan(0)
  }
})
