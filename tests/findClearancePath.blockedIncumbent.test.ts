import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { findClearancePath, type ClearancePathSearchStats } from "../lib/findClearancePath"

test("hard copper and soft congestion both prevent preserving an incumbent", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const route: HighDensityRoute = {
    connectionName: "signal", traceThickness: 0.1, viaDiameter: 0.3,
    vias: [], route: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
  }
  for (const hard of [true, false]) {
    const srj: SimpleRouteJson = {
      bounds, layerCount: 1, minTraceWidth: 0.1, connections: [],
      obstacles: hard ? [{
        type: "rect", center: { x: 0, y: 0 }, width: 0.5, height: 0.5,
        layers: ["top"], connectedTo: ["foreign-pad"],
      }] : [],
    }
    const cost = (a: {x: number; y: number}, b: {x: number; y: number}): number =>
      pointToSegmentDistance({ x: 0, y: 0 }, a, b) < 0.4 ? 100 : 0
    const stats: ClearancePathSearchStats = { nodesPopped: 0, completionReason: "no-path" }
    const output = findClearancePath({
      srj, routes: [route], routeIndex: 0, bounds,
      start: route.route[0]!, end: route.route.at(-1)!,
      traceThickness: 0.1, traceClearance: 0.1, viaClearance: 0.1,
      allowLayerChanges: false, maxNodes: 30000,
      existingPath: route.route, stats,
      getAdditionalEdgeCost: hard ? undefined : cost,
    })
    expect(output).not.toBeNull()
    expect(output).not.toEqual(route.route)
    expect(stats.nodesPopped).toBeGreaterThan(0)
    for (let index = 1; index < output!.length; index++) {
      expect(pointToSegmentDistance({ x: 0, y: 0 }, output![index - 1]!, output![index]!))
        .toBeGreaterThanOrEqual(0.4 - 1e-8)
    }
  }
})
