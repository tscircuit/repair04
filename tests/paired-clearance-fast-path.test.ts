import { expect, test } from "bun:test"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { createNegotiatedClearanceSearch } from "../lib/negotiatedClearanceSearchKernel"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test("zero-pop forward outcomes finish before any reverse lane is constructed", (): void => {
  for (const geometry of ["clear", "endpoint"] as const) {
    const task = createPairedClearanceTask(geometry, 1_000_000)
    const before = structuredClone(task)
    const native = createNegotiatedClearanceSearch(structuredClone(task))
    native.solve()
    const paired = new PairedClearancePathSolver({
      task,
      reverseMaxNodes: 1_000_000,
    })
    paired.solve()
    expect(paired.solved).toBe(true)
    expect(paired.failed).toBe(false)
    expect(paired.getOutput()).toStrictEqual(native.getOutput())
    expect(paired.stats).toStrictEqual(native.stats)
    expect(paired.stats.nodesPopped).toBe(0)
    expect(paired.reverse).toBeUndefined()
    expect(paired.getLaneStats()).toStrictEqual([native.stats])
    expect(paired.forward.isSearchPrepared()).toBe(false)
    if (geometry === "clear") {
      const existingPath = task.pathInput.existingPath
      if (!existingPath) throw new Error("Missing clear-path fixture")
      expect(paired.getOutput()).toStrictEqual(existingPath)
    } else expect(paired.getOutput()).toBeNull()
    expect(task).toStrictEqual(before)
  }
})
