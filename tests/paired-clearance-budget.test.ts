import { expect, test } from "bun:test"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { createNegotiatedClearanceSearch } from "../lib/negotiatedClearanceSearchKernel"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test(
  "paired paths preserve the full forward cap and charge both lane searches",
  (): void => {
    for (const [forwardCap, reverseCap] of [
      [1_300, 70],
      [1_300, 600],
    ] as const) {
      const task = createPairedClearanceTask("wall", forwardCap)
      const native = createNegotiatedClearanceSearch(structuredClone(task))
      native.solve()
      const paired = new PairedClearancePathSolver({
        task,
        reverseMaxNodes: reverseCap,
      })
      while (!paired.solved && !paired.failed) {
        paired.step()
        const lanes = paired.getLaneStats()
        expect(paired.stats.nodesPopped).toBe(
          lanes.reduce((sum, lane): number => sum + lane.nodesPopped, 0),
        )
        expect(lanes[0]!.nodesPopped).toBeLessThanOrEqual(forwardCap)
        if (lanes[1]) {
          expect(lanes[1].nodesPopped).toBeLessThanOrEqual(reverseCap)
        }
      }
      expect(paired.failed).toBe(false)
      expect(paired.getOutput()).toBeNull()
      expect(paired.forward.input.maxNodes).toBe(forwardCap)
      expect(paired.reverse?.input.maxNodes).toBe(reverseCap)
      expect(paired.getLaneStats()).toHaveLength(2)
      expect(paired.getLaneStats()[0]).toStrictEqual(native.stats)
      expect(
        paired.getLaneStats().map((lane): number => lane.nodesPopped),
      ).toStrictEqual([forwardCap, reverseCap])
      expect(paired.stats.nodesPopped).toBe(forwardCap + reverseCap)
    }
  },
)
