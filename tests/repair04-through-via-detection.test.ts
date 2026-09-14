import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"

test("repair scoring detects through-via contacts outside the routed layers", (): void => {
  for (const layerCount of [4, 6]) {
    for (const allowBlindAndBuriedVias of [undefined, false, true]) {
      const routes: HighDensityRoute[] = [
        {
          connectionName: "via-net",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          vias: [{ x: 0, y: 0 }],
          route: [
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 2 },
            { x: 1, y: 0, z: 2 },
          ],
        },
        {
          connectionName: "wire-net",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          vias: [],
          route: [
            { x: -1, y: 0.05, z: layerCount - 1 },
            { x: 1, y: 0.05, z: layerCount - 1 },
          ],
        },
      ]
      const before = structuredClone(routes)
      const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
      const solver = new Repair04Solver({
        srj: {
          layerCount,
          allowBlindAndBuriedVias,
          bounds,
          minTraceWidth: 0.1,
          obstacles: [],
          connections: [],
        },
        routes,
        bounds,
        boundaryMargin: 0.25,
        lockedPointIndices: routes.map((route) => route.route.map(() => true)),
      })
      solver.solve()
      expect(solver.stats.initialErrorCount).toBe(
        allowBlindAndBuriedVias ? 0 : 1,
      )
      const output = solver.getOutput()
      expect(output).toHaveLength(before.length)
      for (let i = 0; i < output.length; i++) {
        expect(output[i]!.vias).toEqual(before[i]!.vias)
        let previousIndex = -1
        for (const point of before[i]!.route) {
          const index = output[i]!.route.findIndex(
            (candidate, index) =>
              index > previousIndex &&
              candidate.x === point.x &&
              candidate.y === point.y &&
              candidate.z === point.z,
          )
          expect(index).toBeGreaterThan(previousIndex)
          previousIndex = index
        }
      }
      expect(routes).toEqual(before)
    }
  }
})
