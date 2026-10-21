import { expect, test } from "bun:test"
import {
  ClearancePathHeap,
  type ClearancePathSearchNode,
} from "../lib/ClearancePathHeap"
import { FrozenClearancePathHeap } from "./fixtures/FrozenClearancePathHeap"

test("scalar queues preserve complete heap state and ties while reusing decreases", (): void => {
  let enqueues = 0
  let allocations = 0
  const workSnapshots = []
  for (const nodeCount of [undefined, 64]) {
    const actual = new ClearancePathHeap(nodeCount)
    const reference = new FrozenClearancePathHeap(nodeCount)
    const retained: Array<{
      node: ClearancePathSearchNode
      snapshot: ClearancePathSearchNode
    }> = []
    const allocated = new Set<ClearancePathSearchNode>()
    const originalAllocated = new Set<ClearancePathSearchNode>()
    const poppedIds: number[] = []
    let seed = 17
    for (let step = 0; step < 4000; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      if (reference.length && step % 4 === 0) {
        const expected = reference.pop()
        const result = actual.pop()
        expect(result).toEqual(expected)
        poppedIds.push(result.id)
        retained.push({ node: result, snapshot: { ...result } })
      } else {
        const id = seed % 64
        const oldValue = reference["values"].find((value) => value.id === id)
        const priority = (oldValue?.priority ?? 1000) - (seed % 4)
        const cost = priority + (step % 7)
        const originalEntry = { id, cost, priority }
        originalAllocated.add(originalEntry)
        reference.push(originalEntry)
        actual.pushValues(id, cost, priority)
        const entry = actual["values"].find((value) => value.id === id)!
        allocated.add(entry)
        enqueues++
      }
      expect(actual["values"]).toEqual(reference["values"])
      for (let id = 0; id < 64; id++) {
        const stored = actual["densePositions"]?.[id]
        const actualPosition =
          stored === undefined
            ? actual["positions"]!.get(id)
            : stored === 0
              ? undefined
              : stored - 1
        expect(actualPosition).toBe(reference["positions"].get(id))
      }
    }
    while (reference.length) {
      const result = actual.pop()
      expect(result).toEqual(reference.pop())
      poppedIds.push(result.id)
    }
    expect(actual.length).toBe(0)
    for (const { node, snapshot } of retained) expect(node).toEqual(snapshot)
    allocations += allocated.size
    workSnapshots.push({
      positionStorage: nodeCount === undefined ? "sparse" : "dense",
      enqueues: originalAllocated.size,
      beforeObjectEnqueues: { allocatedEntries: originalAllocated.size },
      afterHeapOwnedScalarEnqueues: { allocatedEntries: allocated.size },
      entryAllocationsAvoided: originalAllocated.size - allocated.size,
      // These IDs come from pops already compared with the original queue.
      poppedEntries: poppedIds.length,
      firstPoppedIds: poppedIds.slice(0, 8),
      lastPoppedIds: poppedIds.slice(-8),
      retainedPoppedObjects: retained.length,
    })
  }
  expect(allocations).toBeLessThan(enqueues / 2)
  expect(workSnapshots).toMatchSnapshot(
    "priority decreases reuse pending entries and preserve popped objects",
  )
})
