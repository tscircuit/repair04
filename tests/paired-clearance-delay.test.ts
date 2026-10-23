import { expect, test } from "bun:test"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { createNegotiatedClearanceSearch } from "../lib/negotiatedClearanceSearchKernel"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test("reverse search waits for 1024 forward pops and skips cheap terminal paths", (): void => {
  const cheapTask = createPairedClearanceTask("detour", 1_300)
  const native = createNegotiatedClearanceSearch(structuredClone(cheapTask))
  native.solve()
  const cheap = new PairedClearancePathSolver({
    task: cheapTask,
    reverseMaxNodes: 600,
  })
  cheap.solve()
  expect(cheap.failed).toBe(false)
  expect(cheap.getOutput()).toStrictEqual(native.getOutput())
  expect(cheap.forward.stats.nodesPopped).toBe(84)
  expect(cheap.stats).toStrictEqual(native.stats)
  expect(cheap.reverse).toBeUndefined()
  expect(cheap.getLaneStats()).toHaveLength(1)
  for (const cap of [1, 70, 1_024]) {
    const limited = new PairedClearancePathSolver({
      task: createPairedClearanceTask("wall", cap),
      reverseMaxNodes: 600,
    })
    limited.solve()
    expect(limited.failed).toBe(false)
    expect(limited.getOutput()).toBeNull()
    expect(limited.reverse).toBeUndefined()
    expect(limited.stats.nodesPopped).toBe(cap)
    expect(limited.getLaneStats()).toHaveLength(1)
  }
  const task = createPairedClearanceTask("wall", 1_300)
  const before = structuredClone(task)
  const delayed = new PairedClearancePathSolver({
    task,
    reverseMaxNodes: 600,
  })
  let forwardBatches = 0
  while (!delayed.reverse && !delayed.solved && !delayed.failed) {
    const previous = delayed.forward.stats.nodesPopped
    expect(previous).toBeLessThan(1_024)
    delayed.step()
    if (delayed.forward.stats.nodesPopped > previous) forwardBatches++
    expect(delayed.stats.nodesPopped).toBe(delayed.forward.stats.nodesPopped)
  }
  expect(delayed.failed).toBe(false)
  expect(delayed.solved).toBe(false)
  expect(forwardBatches).toBe(8)
  expect(delayed.forward.stats.nodesPopped).toBe(1_024)
  const reverse = delayed.reverse
  if (!reverse) throw new Error("Missing delayed reverse search")
  expect(reverse.iterations).toBe(0)
  expect(reverse.input.maxNodes).toBe(600)
  expect(delayed.forward.input.maxNodes).toBe(1_300)
  while (!reverse.isSearchPrepared() && !reverse.solved && !reverse.failed) {
    delayed.step()
    expect(delayed.forward.stats.nodesPopped).toBe(1_024)
    expect(reverse.stats.nodesPopped).toBe(0)
  }
  expect(reverse.isSearchPrepared()).toBe(true)
  const forwardIterations = delayed.forward.iterations
  const reverseIterations = reverse.iterations
  delayed.step()
  expect(delayed.forward.iterations).toBe(forwardIterations + 1)
  expect(reverse.iterations).toBe(reverseIterations + 1)
  expect(delayed.forward.stats.nodesPopped).toBe(1_152)
  expect(reverse.stats.nodesPopped).toBe(128)
  delayed.solve()
  expect(delayed.failed).toBe(false)
  expect(delayed.getOutput()).toBeNull()
  expect(delayed.stats.nodesPopped).toBe(1_900)
  expect(task).toStrictEqual(before)
})
