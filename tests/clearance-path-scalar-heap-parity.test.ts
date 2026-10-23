import { expect, test } from "bun:test"
import {
  ClearancePathHeap,
  type ClearancePathSearchNode,
} from "../lib/ClearancePathHeap"
import { FrozenClearancePathHeap } from "./fixtures/FrozenClearancePathHeap"
import {
  afterColor,
  beforeColor,
  expectPerformanceSvg,
  performanceCanvas,
  visualMetric,
  visualPanel,
  visualText,
} from "./fixtures/performanceVisual"

test("scalar queues preserve complete heap state and ties while reusing decreases", async (): Promise<void> => {
  let enqueues = 0
  let allocations = 0
  const workSnapshots = []
  let decreaseExample:
    | {
        before: ClearancePathSearchNode
        after: ClearancePathSearchNode
        originalObjectReplaced: boolean
        heapOwnedObjectReused: boolean
      }
    | undefined
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
        const pendingBefore = actual["values"].find((value) => value.id === id)
        const priority = (oldValue?.priority ?? 1000) - (seed % 4)
        const cost = priority + (step % 7)
        const originalEntry = { id, cost, priority }
        const before = oldValue ? { ...oldValue } : undefined
        originalAllocated.add(originalEntry)
        reference.push(originalEntry)
        actual.pushValues(id, cost, priority)
        const entry = actual["values"].find((value) => value.id === id)!
        if (!decreaseExample && before && priority < before.priority) {
          decreaseExample = {
            before,
            after: { ...entry },
            originalObjectReplaced:
              reference["values"].find((value) => value.id === id) !== oldValue,
            heapOwnedObjectReused: pendingBefore === entry,
          }
        }
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
  if (!decreaseExample)
    throw new Error("Expected a priority decrease in the seeded queue workload")
  expect(decreaseExample.originalObjectReplaced).toBe(true)
  expect(decreaseExample.heapOwnedObjectReused).toBe(true)
  const graphics = performanceCanvas(
    "Lower a pending priority without allocating another queue entry",
    "This priority decrease and the allocation totals come from the live frozen-queue comparison, not a simulated memory estimate.",
  )
  for (const [left, title, color, afterObject] of [
    [24, "Before: replace the queued object", beforeColor, "object #2 (new)"],
    [
      624,
      "After: update the heap-owned object",
      afterColor,
      "object #1 (reused)",
    ],
  ] as const) {
    visualPanel(
      graphics,
      left,
      title,
      "Only the pending entry changes. Popped objects retain caller ownership.",
      color,
    )
    for (const [centerX, centerY, entry, label] of [
      [left + 135, 229, decreaseExample.before, "object #1 (pending)"],
      [left + 403, 344, decreaseExample.after, afterObject],
    ] as const) {
      graphics.rects.push({
        center: { x: centerX, y: centerY },
        width: 218,
        height: 86,
        fill: "white",
        stroke: color,
      })
      visualText(graphics, centerX - 93, centerY - 23, label, 15, color)
      visualText(
        graphics,
        centerX - 93,
        centerY + 4,
        `state ${entry.id}  /  priority ${entry.priority}`,
        16,
      )
      visualText(
        graphics,
        centerX - 93,
        centerY + 29,
        `cost ${entry.cost}`,
        14,
        "#64748b",
      )
    }
    graphics.arrows.push({
      start: { x: left + 239, y: 244 },
      end: { x: left + 296, y: 325 },
      color,
    })
    visualText(
      graphics,
      left + 250,
      278,
      left === 24 ? "allocate" : "reuse",
      16,
      color,
    )
    visualText(
      graphics,
      left + 20,
      417,
      "First eight popped state IDs: identical in both queues",
      14,
      "#475569",
    )
    for (const [index, id] of workSnapshots[0]!.firstPoppedIds.entries()) {
      const x = left + 40 + index * 66
      if (index > 0)
        graphics.arrows.push({
          start: { x: x - 50, y: 462 },
          end: { x: x - 18, y: 462 },
          color: "#94a3b8",
        })
      graphics.circles.push({
        center: { x, y: 462 },
        radius: 16,
        fill: "white",
        stroke: "#94a3b8",
      })
      visualText(graphics, x - 9, 462, String(id), 14)
    }
  }
  visualMetric(
    graphics,
    "Observed queue-entry objects allocated in the seeded workload",
    workSnapshots[0]!.beforeObjectEnqueues.allocatedEntries,
    workSnapshots[0]!.afterHeapOwnedScalarEnqueues.allocatedEntries,
    "Dense and sparse queues preserve every heap state and pop; retained popped objects are never mutated.",
  )
  await expectPerformanceSvg(graphics, import.meta.path)
})
