import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("fixed route copper cannot be displaced between its locked vertices", (): void => {
  const srj: SimpleRouteJson = {
    bounds: { minX: -3, maxX: 3, minY: -3, maxY: 3 },
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0.6 },
        width: 0.2,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["foreign-pad"],
      },
    ],
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "new",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
    },
    {
      connectionName: "fixed",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
    },
  ]
  // The fixed route has a pre-existing pad conflict. Search must leave that
  // copper in place instead of silently repairing a route owned by another phase.
  const original = structuredClone(routes)
  for (const direction of [1, 2] as const) {
    for (const resumable of [false, true]) {
      const input = {
        srj,
        routes,
        bounds: srj.bounds,
        dirtyRouteIndices: [0, 1],
        fixedRouteIndices: [1],
        isLocked: (): boolean => true,
        allowLayerChanges: false,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: 120_000,
        maxPathSearchCalls: 100,
        searchDirectionCount: direction,
      }
      const solver = new NegotiateTraceClearanceSolver(input)
      const result = resumable
        ? (solver.solve(), solver.getOutput())
        : negotiateTraceClearance(input)
      expect(result.unresolvedSpanCount).toBe(0)
      expect(result.routes[1]).toEqual(original[1])
      expect(result.routes[0]!.route.length).toBeGreaterThan(2)
      const engine = new AutoroutingDrcEngine(srj, {
        traceClearance: 0.1,
        viaClearance: 0.1,
      })
      expect(
        engine.evaluate(convertRepairRoutesToTraces(result.routes, 1)).errors,
      ).toHaveLength(0)
      expect(routes).toEqual(original)
    }
  }
})
