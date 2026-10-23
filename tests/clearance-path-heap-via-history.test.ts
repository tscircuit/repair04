import { expect, test } from "bun:test"
import { ClearancePathHeap } from "../lib/ClearancePathHeap"

test("priority decreases replace via history with the queued candidate", (): void => {
  for (const nodeCount of [undefined, 100]) {
    const heap = new ClearancePathHeap(nodeCount)
    const firstVia = { x: 1, y: 2 }
    const nextVia = { x: 3, y: 4, previous: firstVia }
    heap.push({ id: 1, cost: 10, priority: 10, viaPath: firstVia })
    heap.push({ id: 2, cost: 8, priority: 8, viaPath: firstVia })
    const replacement = { id: 1, cost: 5, priority: 5, viaPath: nextVia }
    heap.push(replacement)
    expect(heap.pop()).toBe(replacement)
    expect(heap.pop().viaPath).toBe(firstVia)
    heap.push({ id: 1, cost: 2, priority: 2, viaPath: firstVia })
    const withoutVia = { id: 1, cost: 1, priority: 1, viaPath: undefined }
    heap.push(withoutVia)
    expect(heap.pop()).toBe(withoutVia)
    heap.push({ id: 1, cost: 3, priority: 3 })
    expect(heap.pop().viaPath).toBeUndefined()
    expect(heap.length).toBe(0)
  }
})
