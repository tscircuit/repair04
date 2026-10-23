import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import {
  getPreparedSegmentDistance,
  type PreparedSegment,
} from "../lib/preparedDistanceGeometry"

import { prepareDistanceSegment } from "./fixtures/prepareDistanceSegment"

type Point = PreparedSegment["a"]

test("prepared distances exactly match degenerate, crossing and separated segments", (): void => {
  let seed = 17
  for (const scale of [0, 1e-160, 1e-9, 1, 1e9, 1e150]) {
    for (let index = 0; index < 2000; index++) {
      const points: Point[] = []
      for (let vertex = 0; vertex < 4; vertex++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const x = (seed / 0x100000000 - 0.5) * scale
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const y = (seed / 0x100000000 - 0.5) * scale
        points.push({ x, y })
      }
      if (index % 4 === 0) points[1] = points[0]!
      if (index % 7 === 0) points[3] = points[2]!
      const a = points[0]!
      const b = points[1]!
      const u = points[2]!
      const v = points[3]!
      const left = prepareDistanceSegment({ a, b })
      const right = prepareDistanceSegment({ a: u, b: v })
      expect(getPreparedSegmentDistance(left, right)).toBe(
        segmentToSegmentMinDistance(a, b, u, v),
      )
      expect(getPreparedSegmentDistance(right, left)).toBe(
        segmentToSegmentMinDistance(u, v, a, b),
      )
    }
  }
})
