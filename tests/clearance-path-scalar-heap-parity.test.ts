import { expect, test } from "bun:test"
import {
  ClearancePathHeap,
  type ClearancePathSearchNode,
} from "../lib/ClearancePathHeap"
import { FrozenClearancePathHeap } from "./fixtures/FrozenClearancePathHeap"

test("scalar queues preserve complete heap state and ties while reusing decreases", (): void => {
  let enqueues = 0
  let allocations = 0
  for (const nodeCount of [undefined, 64]) {
    const actual = new ClearancePathHeap(nodeCount)
    const reference = new FrozenClearancePathHeap(nodeCount)
    const retained: Array<{
      node: ClearancePathSearchNode
      snapshot: ClearancePathSearchNode
    }> = []
    const allocated = new Set<ClearancePathSearchNode>()
    let seed = 17
    for (let step = 0; step < 4000; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      if (reference.length && step % 4 === 0) {
        const expected = reference.pop()
        const result = actual.pop()
        expect(result).toEqual(expected)
        retained.push({ node: result, snapshot: { ...result } })
      } else {
        const id = seed % 64
        const oldValue = reference["values"].find((value) => value.id === id)
        const priority = (oldValue?.priority ?? 1000) - (seed % 4)
        const cost = priority + (step % 7)
        reference.push({ id, cost, priority })
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
    while (reference.length) expect(actual.pop()).toEqual(reference.pop())
    expect(actual.length).toBe(0)
    for (const { node, snapshot } of retained) expect(node).toEqual(snapshot)
    allocations += allocated.size
  }
  expect(allocations).toBeLessThan(enqueues / 2)
})
