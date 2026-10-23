import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance, type RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"

test("compact projection retains shared-vertex weights and locked contact geometry", (): void => {
  for (const translation of [-12.5, 0, 6.25]) {
    for (const locked of [false, true]) {
      const routes: HighDensityRoute[] = [0, 0.16, 0.32].map((y, index): HighDensityRoute => ({
        connectionName: `signal${index}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [-1, -0.5, 0, 0.5, 1].map((x) => ({ x: x + translation, y, z: 0 })),
      }))
      // Repeated wire points become the same vertex and combine projection weights.
      routes[0]!.route.splice(2, 0, { ...routes[0]!.route[1]! })
      const input: RelaxTraceClearanceInput = {
        srj: {
          bounds: { minX: translation - 2, maxX: translation + 2, minY: -1, maxY: 1 },
          layerCount: 2,
          minTraceWidth: 0.1,
          connections: [],
          obstacles: [{ type: "rect", center: { x: translation, y: 0.48 }, width: 0.3, height: 0.15, layers: ["top"], connectedTo: [] }],
        },
        routes,
        bounds: { minX: translation - 1.5, maxX: translation + 1.5, minY: -0.75, maxY: 0.75 },
        boundaryMargin: 0.05,
        traceClearance: 0.1,
        viaClearance: 0.1,
        allowViaMovement: false,
        lockedPointIndices: routes.map((route) => route.route.map((_, index) => locked || index === 0 || index === route.route.length - 1)),
      }
      const before = structuredClone(input)
      const expected = relaxTraceClearance(input)
      const solver = new RelaxTraceClearanceSolver(input)
      solver.solve()
      expect(solver.solved).toBeTrue()
      expect(solver.failed).toBeFalse()
      expect(solver.getOutput()).toEqual(expected)
      expect(input).toEqual(before)
      if (locked) expect(solver.getOutput().map((route) => route.route)).toEqual(routes.map((route) => route.route))
    }
  }
})
