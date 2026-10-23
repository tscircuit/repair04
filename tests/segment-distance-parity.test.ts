import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { getSegmentToSegmentMinDistance } from "../lib/getSegmentToSegmentMinDistance"

test("distance is identical for ordinary, degenerate, collinear and extreme geometry", (): void => {
  let seed = 417
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (let i = 0; i < 20000; i++) {
    const scale = [1e-12, 0.1, 1, 100, 1e12, 1e155][i % 6]!
    const points = Array.from({ length: 4 }, () => ({x: (random() - 0.5) * scale, y: (random() - 0.5) * scale}))
    if (i % 5 === 0) points[1] = {...points[0]!}
    if (i % 7 === 0) points[3] = {...points[2]!}
    if (i % 11 === 0) for (const p of points) p.y = points[0]!.y
    const [a,b,c,d] = points as [typeof points[number],typeof points[number],typeof points[number],typeof points[number]]
    expect(getSegmentToSegmentMinDistance(a,b,c,d)).toBe(segmentToSegmentMinDistance(a,b,c,d))
    expect(getSegmentToSegmentMinDistance(c,d,a,b)).toBe(segmentToSegmentMinDistance(c,d,a,b))
  }
})
