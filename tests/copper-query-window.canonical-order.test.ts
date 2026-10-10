import { expect, test } from "bun:test"
import { CopperQueryIndex } from "../lib/CopperQueryIndex"

test("canonical hits preserve order and owner sums", (): void => {
  const copper = Array.from({ length: 96 }, (_, index) => ({
    minX: (index % 12) * 0.05,
    minY: Math.floor(index / 12) * 0.05,
    maxX: (index % 12) * 0.05 + 0.01,
    maxY: Math.floor(index / 12) * 0.05 + 0.01,
    radius: 0,
    index,
    cellX: Math.floor((index % 12) * 0.05),
    cellY: Math.floor(Math.floor(index / 12) * 0.05),
    owner: `owner-${index % 3}`,
    cost: index % 3 === 0 ? 1e16 : index % 7 === 0 ? 0.5 : 1,
  }))
  const indexed = new CopperQueryIndex(copper)
  let differingTraversal = false
  for (let x = 0.05; x < 0.5; x += 0.05) {
    const minX = x
    const minY = 0.05
    const maxX = x + 0.1
    const maxY = 0.25
    const direct = indexed.index.search(minX, minY, maxX, maxY)
    const reused = indexed.search(minX, minY, maxX, maxY, 1)
    differingTraversal ||= JSON.stringify(direct) !== JSON.stringify(reused)
    const sortedHits = (candidates: number[]): typeof copper => {
      const firstCellX = Math.floor(minX)
      const firstCellY = Math.floor(minY)
      return candidates
        .map((candidate) => copper[candidate]!)
        .sort((left, right) => {
          const cellX =
            Math.max(firstCellX, left.cellX) - Math.max(firstCellX, right.cellX)
          if (cellX !== 0) return cellX
          const cellY =
            Math.max(firstCellY, left.cellY) - Math.max(firstCellY, right.cellY)
          return cellY || left.index - right.index
        })
    }
    const getOwnerCosts = (hits: typeof copper): [string[], number] => {
      const costs = new Map<string, number>()
      for (const hit of hits)
        costs.set(hit.owner, Math.max(costs.get(hit.owner) ?? 0, hit.cost))
      let total = 0
      for (const cost of costs.values()) total += cost
      return [[...costs.keys()], total]
    }
    const originalHits = sortedHits(direct)
    const reusedHits = sortedHits(reused)
    expect(reusedHits).toEqual(originalHits)
    expect(getOwnerCosts(reusedHits)).toEqual(getOwnerCosts(originalHits))
  }
  // Exercise the query-dependent Flatbush optimization, rather than merely
  // comparing two coincidentally equal candidate iteration orders.
  expect(differingTraversal).toBe(true)
})
