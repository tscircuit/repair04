import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import {
  getPreparedSegmentToBoundsDistance,
  prepareDistanceBounds,
  type PreparedSegment,
} from "../lib/preparedDistanceGeometry"
import { prepareDistanceSegment } from "./fixtures/prepareDistanceSegment"

type Point = PreparedSegment["a"]

test("prepared rectangular distances preserve exact boundaries and degenerate segments", (): void => {
  let seed = 31
  for (const scale of [0, 1e-160, 1e-9, 1, 1e9, 1e150]) {
    for (let index = 0; index < 2000; index++) {
      const offset = ((index % 7) - 3) * scale * 1000
      const bounds = {
        minX: offset - 2 * scale,
        maxX: offset + 2 * scale,
        minY: offset - 0.5 * scale,
        maxY: offset + 0.5 * scale,
      }
      if (index % 11 === 0) {
        [bounds.minX, bounds.maxX] = [bounds.maxX, bounds.minX]
      }
      if (index % 13 === 0) bounds.maxY = bounds.minY
      const points: Point[] = []
      for (let vertex = 0; vertex < 2; vertex++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const x = offset + (seed / 0x100000000 - 0.5) * 8 * scale
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const y = offset + (seed / 0x100000000 - 0.5) * 8 * scale
        points.push({ x, y })
      }
      if (index % 3 === 0) points[1] = points[0]!
      if (index % 7 === 0) {
        points[0] = { x: bounds.minX, y: bounds.minY }
        points[1] = { x: bounds.maxX, y: bounds.minY }
      }
      const a = points[0]!
      const b = points[1]!
      const preparedBounds = prepareDistanceBounds(bounds)
      expect(
        getPreparedSegmentToBoundsDistance(
          prepareDistanceSegment({ a, b }),
          preparedBounds,
        ),
      ).toBe(segmentToBoundsMinDistance(a, b, bounds))
      expect(
        getPreparedSegmentToBoundsDistance(
          prepareDistanceSegment({ a: b, b: a }),
          preparedBounds,
        ),
      ).toBe(segmentToBoundsMinDistance(b, a, bounds))
    }
  }
})
