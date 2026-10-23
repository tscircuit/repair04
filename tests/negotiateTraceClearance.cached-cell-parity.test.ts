import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import {
  negotiateTraceClearance,
  type NegotiatedClearanceInput,
} from "../lib/negotiateTraceClearance"

test("cached copper cells preserve query boundaries and complete negotiation order", (): void => {
  for (const translation of [-2.5, -1e-9, 0, 1e-9, 2.5]) {
    for (const separation of [0.2 - 1e-6, 0.2, 0.2 + 1e-6]) {
      const bounds = {
        minX: translation - 3,
        maxX: translation + 3,
        minY: -2,
        maxY: 2,
      }
      const routes: HighDensityRoute[] = [0, separation, -separation, 0.75].map(
        (y, index): HighDensityRoute => ({
          connectionName: `signal${index}`,
          traceThickness: 0.1,
          viaDiameter: 0.3,
          vias: [],
          route: [
            { x: translation - 2.8, y, z: 0 },
            { x: translation + 2.8, y, z: 0 },
          ],
        }),
      )
      const input: NegotiatedClearanceInput = {
        srj: {
          bounds,
          minTraceWidth: 0.1,
          layerCount: 2,
          connections: [],
          obstacles: [],
        },
        bounds,
        routes,
        dirtyRouteIndices: [0],
        isLocked: (): boolean => false,
        allowLayerChanges: false,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: 30000,
        maxPathSearchCalls: 3,
      }
      const original = structuredClone(routes)
      const referenceSearches: unknown[] = []
      const reference = negotiateTraceClearance({
        ...input,
        onSearch: (stats): void => {
          referenceSearches.push({ ...stats })
        },
      })
      const searches: unknown[] = []
      const solver = new NegotiateTraceClearanceSolver({
        ...input,
        onSearch: (stats): void => {
          searches.push({ ...stats })
        },
      })
      solver.solve()
      expect(solver.failed).toBeFalse()
      expect(solver.getOutput()).toEqual(reference)
      expect(searches).toEqual(referenceSearches)
      expect(routes).toEqual(original)
    }
  }
})
