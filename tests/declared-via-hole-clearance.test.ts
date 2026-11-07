import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("declared drill spacing stays independent of copper clearance in both search directions", (): void => {
  const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
  const srj: SimpleRouteJson & {
    minViaHoleEdgeToViaHoleEdgeClearance: number
  } = {
    bounds,
    layerCount: 4,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
    minViaHoleEdgeToViaHoleEdgeClearance: 0.3,
  }
  const routes: HighDensityRoute[] = [0, 0.25].map((x, index) => ({
    connectionName: `branch-${index}`,
    rootConnectionName: "same-net",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x, y: 0 }],
    route: [
      { x, y: 0, z: 0 },
      { x, y: 0, z: 3 },
    ],
  }))
  for (const direction of [1, 2] as const) {
    for (const resumable of [false, true]) {
      const input = {
        srj,
        routes,
        bounds,
        dirtyRouteIndices: [0],
        isLocked: (ri: number): boolean => ri === 1,
        allowLayerChanges: true,
        traceClearance: 0.1,
        viaClearance: 0.1,
        viaHoleDiameter: 0.2,
        maxPathSearchNodes: 120_000,
        maxPathSearchCalls: 10,
        searchDirectionCount: direction,
      }
      const solver = new NegotiateTraceClearanceSolver(input)
      const result = resumable
        ? (solver.solve(), solver.getOutput())
        : negotiateTraceClearance(input)
      expect(result.unresolvedSpanCount).toBe(0)
      expect(result.routes[1]).toEqual(routes[1])
      expect(result.routes[0]!.vias).toHaveLength(1)
      const via = result.routes[0]!.vias[0]!
      expect(Math.hypot(via.x - 0.25, via.y) - 0.2).toBeGreaterThanOrEqual(
        0.3 - 1e-8,
      )
      expect(result.routes[0]!.route[0]).toEqual(routes[0]!.route[0])
      expect(result.routes[0]!.route.at(-1)).toEqual(routes[0]!.route.at(-1))
    }
  }
})
