import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("copper bounds preserve exact-clearance and near-contact search results", (): void => {
  const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  for (const separation of [0.2, 0.2 - 1e-6, 0.2 + 1e-6]) {
    const routes: HighDensityRoute[] = [
      {
        connectionName: "signal",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: -0.8, y: 0, z: 0 },
          { x: 0.8, y: 0, z: 0 },
        ],
      },
      {
        connectionName: "neighbor",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: -0.4, y: separation, z: 0 },
          { x: 0.4, y: separation, z: 0 },
        ],
      },
    ]
    // These tracks share spatial buckets with the queried edges, but their
    // bounds prove separation. They must not alter costs or visit order.
    const distant: HighDensityRoute[] = Array.from(
      { length: 8 },
      (_, index): HighDensityRoute => ({
        connectionName: `distant-${index}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: -0.4, y: 0.6 + index * 0.03, z: 0 },
          { x: 0.4, y: 0.6 + index * 0.03, z: 0 },
        ],
      }),
    )
    for (const context of [routes, [...routes, ...distant]]) {
      const original = structuredClone(context)
      const result = negotiateTraceClearance({
        srj: {
          bounds,
          layerCount: 2,
          minTraceWidth: 0.1,
          connections: [],
          obstacles: [],
        },
        routes: context,
        bounds,
        dirtyRouteIndices: [0],
        isLocked: (): boolean => false,
        allowLayerChanges: false,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: 10000,
        maxPathSearchCalls: 2,
      })
      // Captured from the published search before bounds pruning. Keeping the
      // route and work count exact also protects tie-breaking and query order.
      expect(result.routes[0]!.route).toEqual(
        separation < 0.2
          ? [
              routes[0]!.route[0],
              {
                x: 0.675,
                y: -0.02499999999999991,
                z: 0,
                traceThickness: 0.1,
              },
              routes[0]!.route[1],
            ]
          : routes[0]!.route,
      )
      expect(result.pathSearchNodes).toBe(separation < 0.2 ? 34 : 0)
      expect(result.pathSearchCalls).toBe(1)
      expect(result.unresolvedSpanCount).toBe(0)
      expect(result.routes.slice(1)).toEqual(context.slice(1))
      expect(context).toEqual(original)
    }
  }
})
