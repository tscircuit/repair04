import { expect, test } from "bun:test"
import { ClearancePathHeap } from "../lib/ClearancePathHeap"

test("dense path queues preserve sparse queue ordering through decreases and reinsertion", () => {
  const sparse = new ClearancePathHeap()
  const dense = new ClearancePathHeap(100)
  for (const heap of [sparse, dense]) {
    for (let id = 0; id < 100; id++) {
      heap.push({ id, cost: id % 9, priority: id % 9 })
    }
    for (let id = 0; id < 100; id += 3) {
      heap.push({ id, cost: -id, priority: -id })
    }
  }
  for (let index = 0; index < 100; index++) {
    const expected = sparse.pop()
    expect(dense.pop()).toEqual(expected)
    if (index < 20) {
      const value = { id: expected.id, cost: 100, priority: 100 }
      sparse.push(value)
      dense.push(value)
    }
  }
  while (sparse.length) expect(dense.pop()).toEqual(sparse.pop())
  expect(dense.length).toBe(0)
})
