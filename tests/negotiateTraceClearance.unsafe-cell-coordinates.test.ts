import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("copper queries use tree bounds when integer cell increments cannot advance", (): void => {
  for (const coordinate of [2 ** 53, 1e20, -(2 ** 53), -1e20]) {
    for (const axis of ["x", "y"] as const) {
      const point = (position: number): RepairRoutePoint =>
        axis === "x" ? { x: coordinate, y: position, z: 0 } : { x: position, y: coordinate, z: 0 }
      const bounds = axis === "x"
        ? { minX: coordinate - 1e6, maxX: coordinate + 1e6, minY: -16, maxY: 16 }
        : { minX: -16, maxX: 16, minY: coordinate - 1e6, maxY: coordinate + 1e6 }
      const routes: HighDensityRoute[] = [[-8, 8], [3, 4]].map(([start, end], index): HighDensityRoute => ({
        connectionName: `signal${index}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [point(start!), point(end!)],
      }))
      const solver = new NegotiateTraceClearanceSolver({
        srj: { bounds, layerCount: 2, minTraceWidth: 0.1, connections: [], obstacles: [] },
        bounds,
        routes,
        dirtyRouteIndices: [0],
        isLocked: (): boolean => false,
        allowLayerChanges: false,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: 1,
        maxPathSearchCalls: 1,
      })
      // Inspect the real negotiation callback before the child searches. This
      // isolates copper indexing from the path solver's separate integer grid.
      while (!solver.activeSubSolver && !solver.solved && !solver.failed) solver.step()
      expect(solver.activeSubSolver).toBeInstanceOf(FindClearancePathSolver)
      const child = solver.activeSubSolver as FindClearancePathSolver
      const query = child.input.getAdditionalEdgeCost!
      expect(query(point(0), point(0.25))).toBe(0)
      const crossingCost = query(point(3.25), point(3.5))
      expect(Number.isFinite(crossingCost)).toBeTrue()
      expect(crossingCost).toBeGreaterThan(0)
    }
  }
})
