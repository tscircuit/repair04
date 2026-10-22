import { expect, test } from "bun:test"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import {
  negotiateTraceClearance,
  type NegotiatedClearanceInput,
} from "../lib/negotiateTraceClearance"

test("negotiation preserves a fixed collar via without a local layer transition", () => {
  const input: NegotiatedClearanceInput = {
    srj: {
      layerCount: 4,
      minTraceWidth: 0.15,
      bounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 },
      obstacles: [],
      connections: [],
    },
    bounds: { minX: 1, maxX: 9, minY: 1, maxY: 9 },
    routes: [
      {
        connectionName: "fixed-collar",
        traceThickness: 0.15,
        viaDiameter: 0.45,
        route: [
          { x: 0, y: 5, z: 3 },
          { x: 0.5, y: 5, z: 3 },
          { x: 0.75, y: 6, z: 3 },
        ],
        vias: [{ x: 0.5, y: 5 }],
      },
    ],
    dirtyRouteIndices: [],
    isLocked: () => true,
    maxPathSearchCalls: 0,
    maxPathSearchNodes: 0,
    allowLayerChanges: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
  }
  const before = structuredClone(input.routes)
  const solver = new NegotiateTraceClearanceSolver(input)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.getOutput().routes).toEqual(before)
  expect(negotiateTraceClearance(input).routes).toEqual(before)
  expect(input.routes).toEqual(before)
})
