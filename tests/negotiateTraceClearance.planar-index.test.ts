import { expect, test } from "bun:test"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { createPlanarCopperEligibilityProblem } from "./fixtures/createPlanarCopperEligibilityProblem"

test("planar indexes preserve paths and drill checks around fixed and same-net vias", (): void => {
  for (const allowBlindAndBuriedVias of [false, true]) {
    for (const endZ of [0, 1]) {
      const input = createPlanarCopperEligibilityProblem({
        allowBlindAndBuriedVias,
        endZ,
      })
      const originalRoutes = structuredClone(input.routes)
      const reference = negotiateTraceClearance(input)
      const solver = new NegotiateTraceClearanceSolver(input)
      solver.solve()
      expect(solver.solved).toBe(true)
      expect(solver.failed).toBe(false)
      const result = solver.getOutput()
      expect(result).toEqual(reference)
      expect(result.pathSearchNodes).toBe(endZ === 0 ? 99 : 148)
      expect(result.pathSearchCalls).toBe(1)
      expect(result.unresolvedSpanCount).toBe(0)
      expect(result.routes.slice(1)).toEqual(originalRoutes.slice(1))
      expect(input.routes).toEqual(originalRoutes)
      const middlePoints =
        endZ === 0
          ? [
              {
                x: -0.4249999999999998,
                y: -0.07499999999999996,
                z: 0,
                traceThickness: 0.1,
              },
              {
                x: 1.475,
                y: -0.07499999999999996,
                z: 0,
                traceThickness: 0.1,
              },
            ]
          : [
              {
                x: -1.325,
                y: -0.02499999999999991,
                z: 0,
                traceThickness: 0.1,
              },
              {
                x: -1.325,
                y: -0.02499999999999991,
                z: 1,
                traceThickness: 0.1,
              },
            ]
      expect(result.routes[0]!.route).toEqual([
        originalRoutes[0]!.route[0]!,
        ...middlePoints,
        originalRoutes[0]!.route.at(-1)!,
      ])
      expect(result.routes[0]!.vias).toHaveLength(endZ === 0 ? 0 : 1)
    }
  }
})
