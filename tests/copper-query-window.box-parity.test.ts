import { expect, test } from "bun:test"
import Flatbush from "flatbush"
import { CopperQueryIndex } from "../lib/CopperQueryIndex"
import { REGION_EPSILON } from "../lib/repairRegionGeometry"

test("copper windows preserve exact sets and unusual boxes", (): void => {
  type Copper = {
    minX: number
    minY: number
    maxX: number
    maxY: number
    radius: number
  }
  const createOriginal = (copper: Copper[]): Flatbush => {
    const index = new Flatbush(copper.length)
    for (const item of copper)
      index.add(
        item.minX - item.radius - REGION_EPSILON,
        item.minY - item.radius - REGION_EPSILON,
        item.maxX + item.radius + REGION_EPSILON,
        item.maxY + item.radius + REGION_EPSILON,
      )
    index.finish()
    return index
  }
  const copper: Copper[] = Array.from(
    { length: 64 },
    (_, i): Copper => ({
      minX: (i % 8) / 10,
      minY: Math.floor(i / 8) / 10,
      maxX: (i % 8) / 10 + (i % 3 === 0 ? 0 : 0.025),
      maxY: Math.floor(i / 8) / 10 + (i % 5 === 0 ? 0 : 0.025),
      radius: i % 2 === 0 ? 0 : 0.005,
    }),
  )
  const original = createOriginal(copper)
  const cached = new CopperQueryIndex(copper)
  const queries: number[][] = [
    [-0.01, -0.01, 0.1, 0.1],
    [0.2, 0.2, 0.25, 0.25],
    [-0, 0, 0, -0],
    [-1, -1, 1, 1],
    [100, 100, 100, 100],
  ]
  for (const item of copper) {
    const minX = item.minX - item.radius - REGION_EPSILON
    const minY = item.minY - item.radius - REGION_EPSILON
    const maxX = item.maxX + item.radius + REGION_EPSILON
    const maxY = item.maxY + item.radius + REGION_EPSILON
    queries.push(
      [minX, minY, minX, maxY],
      [maxX, minY, maxX, maxY],
      [minX, minY, maxX, minY],
      [minX, maxY, maxX, maxY],
    )
  }
  for (const [minX, minY, maxX, maxY] of queries) {
    expect(
      cached.search(minX!, minY!, maxX!, maxY!, 1).sort((a, b) => a - b),
    ).toEqual(original.search(minX!, minY!, maxX!, maxY!).sort((a, b) => a - b))
    expect(
      cached
        .searchWithinBounds(minX!, minY!, maxX!, maxY!, -1, -1, 1, 1)
        .sort((a, b) => a - b),
    ).toEqual(original.search(minX!, minY!, maxX!, maxY!).sort((a, b) => a - b))
  }
  // The cache filters against the finalized index's captured Float64 bounds,
  // even when source records change after indexing.
  copper[0]!.minX = 500
  expect(
    cached.search(-0.01, -0.01, 0.1, 0.1, 1).sort((a, b) => a - b),
  ).toEqual(original.search(-0.01, -0.01, 0.1, 0.1).sort((a, b) => a - b))

  const reversed = Array.from(
    { length: 17 },
    (_, i): Copper => ({
      minX: i === 16 ? 10 : 1,
      minY: 0,
      maxX: i === 16 ? 0 : 9,
      maxY: 1,
      radius: 0,
    }),
  )
  const reversedOriginal = createOriginal(reversed)
  const reversedCached = new CopperQueryIndex(reversed)
  const contained = [
    1 - REGION_EPSILON,
    -REGION_EPSILON,
    9 + REGION_EPSILON,
    1 + REGION_EPSILON,
  ] as const
  const containedCandidates = reversedOriginal.search(...contained)
  expect(containedCandidates).toHaveLength(17)
  expect(reversedCached.search(...contained, 1)).toEqual(containedCandidates)
  expect(reversedCached.searchWithinBounds(...contained, ...contained)).toEqual(
    containedCandidates,
  )

  for (const records of [
    [{ minX: 0, minY: 0, maxX: 0, maxY: 0, radius: -REGION_EPSILON }],
    [{ minX: NaN, minY: 0, maxX: 1, maxY: 1, radius: 0 }],
    [{ minX: -Infinity, minY: 0, maxX: Infinity, maxY: 1, radius: 0 }],
    [{ minX: 0, minY: 0, maxX: 0, maxY: 0, radius: -0.1 }],
  ]) {
    const direct = createOriginal(records)
    const indexed = new CopperQueryIndex(records)
    expect(indexed.search(-1, -1, 1, 1, 1)).toEqual(direct.search(-1, -1, 1, 1))
    expect(indexed.searchWithinBounds(-1, -1, 1, 1, -2, -2, 2, 2)).toEqual(
      direct.search(-1, -1, 1, 1),
    )
  }
  for (const [minX, minY, maxX, maxY] of [
    [NaN, 0, 1, 1],
    [-Infinity, -Infinity, Infinity, Infinity],
    [1, 0, -1, 1],
    [0, 1, 1, -1],
  ]) {
    expect(cached.search(minX!, minY!, maxX!, maxY!, 1)).toEqual(
      original.search(minX!, minY!, maxX!, maxY!),
    )
    expect(
      cached.searchWithinBounds(minX!, minY!, maxX!, maxY!, -1, -1, 1, 1),
    ).toEqual(original.search(minX!, minY!, maxX!, maxY!))
  }
  // A stale or malformed proposed neighborhood must never hide actual hits.
  for (const window of [
    [0.2, 0.2, 0.3, 0.3],
    [NaN, -1, 1, 1],
    [-Infinity, -1, Infinity, 1],
    [1, 1, -1, -1],
  ])
    expect(
      cached.searchWithinBounds(
        0,
        0,
        0.1,
        0.1,
        window[0]!,
        window[1]!,
        window[2]!,
        window[3]!,
      ),
    ).toEqual(original.search(0, 0, 0.1, 0.1))
})
