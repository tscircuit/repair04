import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("an infeasible dirty span stays unresolved without consuming unavailable work", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = { bounds, layerCount: 1, minTraceWidth: 0.1,
    connections: [], obstacles: [{ type: "rect", center: { x: 0, y: 0 },
      width: 20, height: 20, layers: ["top"], connectedTo: ["fixed"] }] }
  const routes: HighDensityRoute[] = [{ connectionName: "signal", traceThickness: 0.1,
    viaDiameter: 0.3, vias: [], route: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }]
  const input = { srj, routes, bounds, dirtyRouteIndices: [0],
    isLocked: (): boolean => true, allowLayerChanges: false,
    traceClearance: 0.1, viaClearance: 0.1, maxPathSearchNodes: 100,
    maxPathSearchCalls: 1 }
  const frozen = negotiateTraceClearance(input)
  expect(frozen.routes).toEqual(routes)
  expect(frozen.unresolvedSpanCount).toBe(1)
  expect(frozen.pathSearchCalls).toBe(1)
  expect(frozen.pathSearchNodes).toBe(0)
  const stopped = negotiateTraceClearance({ ...input, maxPathSearchNodes: 0 })
  expect(stopped.routes).toEqual(routes)
  expect(stopped.unresolvedSpanCount).toBe(1)
  expect(stopped.pathSearchCalls).toBe(0)
  expect(stopped.pathSearchNodes).toBe(0)
})
