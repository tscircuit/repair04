import { expect, test } from "bun:test"
import { ClearancePathHeap } from "../lib/ClearancePathHeap"
import { FrozenClearancePathHeap } from "./fixtures/FrozenClearancePathHeap"

test("object enqueues preserve caller references through mixed scalar updates", (): void => {
  for (const nodeCount of [undefined, 8]) {
    const actual = new ClearancePathHeap(nodeCount)
    const reference = new FrozenClearancePathHeap(nodeCount)
    const first = { id: 1, cost: 10, priority: 10 }
    const replacement = { id: 1, cost: 7, priority: 10 }
    actual.push(first)
    reference.push({ ...first })
    actual.push(replacement)
    reference.push({ ...replacement })
    expect(actual["values"][0]).toBe(replacement)
    actual.pushValues(1, 6, 10)
    reference.push({ id: 1, cost: 6, priority: 10 })
    expect(first).toEqual({ id: 1, cost: 10, priority: 10 })
    expect(replacement).toEqual({ id: 1, cost: 7, priority: 10 })
    expect(actual["values"][0]).not.toBe(replacement)
    expect(() => actual.pushValues(1, 12, 12)).toThrow("only decrease")
    expect(actual["values"]).toEqual(reference["values"])
    const popped = actual.pop()
    expect(popped).toEqual(reference.pop())
    actual.pushValues(1, 5, 5)
    const owned = actual["values"][0]!
    actual.pushValues(1, 4, 4)
    expect(actual["values"][0]).toBe(owned)
    expect(popped).toEqual({ id: 1, cost: 6, priority: 10 })
    expect(actual.pop()).toBe(owned)
    // Public object pushes still return the exact supplied object after reset.
    actual.push(first)
    expect(actual.pop()).toBe(first)
    // Grid lookup treats signed zeros as the same ID, but the latest payload
    // must retain the exact sign supplied by the replacement enqueue.
    for (const [firstId, replacementId] of [
      [0, -0],
      [-0, 0],
    ] as const) {
      actual.pushValues(firstId, 10, 10)
      reference.push({ id: firstId, cost: 10, priority: 10 })
      actual.pushValues(replacementId, 5, 5)
      reference.push({ id: replacementId, cost: 5, priority: 5 })
      expect(Object.is(actual.pop().id, reference.pop().id)).toBeTrue()
    }
  }
})
