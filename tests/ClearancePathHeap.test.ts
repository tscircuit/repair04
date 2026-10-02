import { expect, test } from "bun:test"
import { ClearancePathHeap } from "../lib/ClearancePathHeap"

test("priority decreases keep one pending state and popped states can reopen", (): void => {
  const heap = new ClearancePathHeap()
  heap.push({ id: 1, cost: 4, priority: 4 })
  heap.push({ id: 2, cost: 8, priority: 8 })
  heap.push({ id: 3, cost: 9, priority: 9 })
  heap.push({ id: 3, cost: 2, priority: 2 })
  heap.push({ id: 3, cost: 1, priority: 1 })
  expect(heap.length).toBe(3)
  expect(heap.pop()).toEqual({ id: 3, cost: 1, priority: 1 })
  heap.push({ id: 3, cost: 0, priority: 0 })
  heap.push({ id: 2, cost: 3, priority: 3 })
  expect(heap.pop().id).toBe(3)
  expect(heap.pop().id).toBe(2)
  expect(heap.pop().id).toBe(1)
  expect(heap.length).toBe(0)

  // Equal-priority children keep the existing binary heap's left-child tie
  // selection, and an equal-priority decrease still replaces the payload.
  for (const id of [1, 2, 3]) heap.push({ id, cost: 8, priority: 10 })
  heap.push({ id: 2, cost: 7, priority: 10 })
  expect(heap.pop().id).toBe(1)
  expect(heap.pop().id).toBe(3)
  expect(heap.pop()).toEqual({ id: 2, cost: 7, priority: 10 })

  const expected = new Map<number, number>()
  let seed = 17
  for (let step = 0; step < 2000; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    if (expected.size && step % 3 === 0) {
      const node = heap.pop()
      expect(node.priority).toBe(Math.min(...expected.values()))
      expect(node.cost).toBe(expected.get(node.id)!)
      expected.delete(node.id)
    } else {
      const id = seed % 100
      const priority = (expected.get(id) ?? 10000) - 1 - (seed % 17)
      heap.push({ id, cost: priority, priority })
      expected.set(id, priority)
    }
    expect(heap.length).toBe(expected.size)
  }
  while (expected.size) {
    const node = heap.pop()
    expect(node.priority).toBe(Math.min(...expected.values()))
    expect(node.cost).toBe(expected.get(node.id)!)
    expected.delete(node.id)
  }
  expect(heap.length).toBe(0)
})
