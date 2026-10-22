import { expect, test } from "bun:test"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import {
  createPairedClearanceTask,
  pairedPublicState,
  stepPairedUntil,
} from "./fixtures/pairedClearanceFixture"

test(
  "paired native prefixes resume with exact geometry and accounting",
  (): void => {
    const task = createPairedClearanceTask("detour")
    const before = structuredClone(task)
    const baseline = new PairedClearancePathSolver({
      task: structuredClone(task),
      reverseMaxNodes: 2_000,
    })
    baseline.solve()
    expect(baseline.solved).toBe(true)
    expect(baseline.failed).toBe(false)
    const path = baseline.getOutput()
    expect(path).not.toBeNull()
    expect(path).not.toStrictEqual(task.pathInput.existingPath)
    expect(path![0]).toStrictEqual(task.pathInput.start)
    expect(path!.at(-1)).toStrictEqual(task.pathInput.end)
    expect(
      getFixedObstacleViolations({
        srj: task.pathInput.srj,
        routes: [{ ...task.pathInput.routes[0]!, route: path! }],
      }),
    ).toHaveLength(0)
    expect(baseline.reverse).toBeUndefined()
    for (const geometry of ["detour", "wall"] as const) {
      const resumeTask = createPairedClearanceTask(geometry, 1_300)
      const uninterrupted = new PairedClearancePathSolver({
        task: structuredClone(resumeTask),
        reverseMaxNodes: 600,
      })
      uninterrupted.solve()
      expect(uninterrupted.solved).toBe(true)
      expect(uninterrupted.failed).toBe(false)
      for (const prefix of [
        0, 1, 3, 5, 8, 13, 14, 15, 20, 21, 25, Infinity,
      ]) {
        const resumed = new PairedClearancePathSolver({
          task: structuredClone(resumeTask),
          reverseMaxNodes: 600,
        })
        stepPairedUntil(resumed, prefix)
        const atPrefix = pairedPublicState(resumed)
        stepPairedUntil(resumed, prefix)
        expect(pairedPublicState(resumed)).toStrictEqual(atPrefix)
        resumed.solve()
        expect(pairedPublicState(resumed)).toStrictEqual(
          pairedPublicState(uninterrupted),
        )
      }
    }
    for (const limit of [0, 1, 3, 8, 13, 14, 15, 20]) {
      const limited = new PairedClearancePathSolver({
        task: createPairedClearanceTask("wall", 1_300),
        reverseMaxNodes: 600,
      })
      limited.MAX_ITERATIONS = limit
      limited.solve()
      expect(limited.failed).toBe(true)
      expect(limited.iterations).toBe(Math.max(1, limit))
      expect(() => limited.getOutput()).toThrow()
    }
    expect(task).toStrictEqual(before)
  },
)
