import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"
type Access = {
  routes: HighDensityRoute[]
  score: unknown
  bestAdjustment: unknown
}

test("omitted work limits preserve legacy step state and nonbinding limits produce identical routes", (): void => {
  for (const allowLayerChanges of [false, true])
    for (const blocked of [false, true]) {
      const input = makeBudgetInput([
        makeBudgetRoute("signal", [
          [-4, 0],
          [0, 0],
          [4, 0],
        ]),
      ])
      if (blocked)
        input.srj.obstacles.push({
          type: "rect",
          center: { x: 0, y: 0 },
          width: 0.5,
          height: 12,
          layers: ["top"],
          connectedTo: ["pcb_smtpad_foreign"],
        })
      const plain = new Repair04Solver({ ...input, allowLayerChanges })
      const counted = new Repair04Solver({
        ...input,
        allowLayerChanges,
        maxCandidateAttempts: Number.MAX_SAFE_INTEGER,
        maxPathSearchNodes: Number.MAX_SAFE_INTEGER,
      })
      const a = plain as unknown as Access,
        b = counted as unknown as Access
      while (!plain.solved && !plain.failed) {
        plain.step()
        counted.step()
        expect(counted.solved).toBe(plain.solved)
        expect(counted.failed).toBe(plain.failed)
        expect(counted.iterations).toBe(plain.iterations)
        expect(a.routes).toEqual(b.routes)
        expect(a.score).toEqual(b.score)
        expect(a.bestAdjustment).toEqual(b.bestAdjustment)
        expect(Object.keys(plain.stats).sort()).toEqual([
          "accepted",
          "candidates",
          "finalErrorCount",
          "initialErrorCount",
        ])
        for (const key of Object.keys(plain.stats))
          expect(counted.stats[key]).toEqual(plain.stats[key])
      }
      expect(plain.failed).toBe(false)
      expect(counted.getOutput()).toEqual(plain.getOutput())
      expect(counted.stats.candidates).toBeLessThanOrEqual(input.maxCandidates!)
    }
})
