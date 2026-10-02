import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { areExpandedBoundsSeparated } from "../lib/areExpandedBoundsSeparated"
import type { Bounds } from "../lib/repairRegionTypes"

type Point = { x: number; y: number }

test("expanded bounds retain tangent, degenerate, and rotated pad contacts", (): void => {
  const boundsOf = (points: Point[]): Bounds => ({
    minX: Math.min(...points.map((point): number => point.x)),
    maxX: Math.max(...points.map((point): number => point.x)),
    minY: Math.min(...points.map((point): number => point.y)),
    maxY: Math.max(...points.map((point): number => point.y)),
  })
  let rejected = 0
  for (const degrees of [0, 17, 45, 90, 133]) {
    const radians = (degrees * Math.PI) / 180
    const cosine = Math.cos(radians),
      sine = Math.sin(radians)
    for (const translation of [-1000, 0, 1000]) {
      const transform = ({ x, y }: Point): Point => ({
        x: translation + x * cosine - y * sine,
        y: -translation + x * sine + y * cosine,
      })
      const corners = [
        { x: -0.6, y: -0.2 },
        { x: 0.6, y: -0.2 },
        { x: 0.6, y: 0.2 },
        { x: -0.6, y: 0.2 },
      ].map(transform)
      const padBounds = boundsOf(corners)
      for (const radius of [0.05, 0.15]) {
        // Match projection's pad reach: copper radius, clearance, then the
        // maximum possible motion. This tests the broad phase, not a new rule.
        const reach = radius + 0.1 + Math.SQRT2 * 0.25
        for (const delta of [-1e-6, 0, 1e-6, 2]) {
          for (const length of [0, 0.4]) {
            const a = transform({ x: -length / 2, y: 0.2 + reach + delta })
            const b = transform({ x: length / 2, y: 0.2 + reach + delta })
            const separated = areExpandedBoundsSeparated(
              boundsOf([a, b]),
              padBounds,
              reach,
            )
            const distance = Math.min(
              ...corners.map((corner, index): number =>
                segmentToSegmentMinDistance(
                  a,
                  b,
                  corner,
                  corners[(index + 1) % corners.length]!,
                ),
              ),
            )
            if (separated) {
              rejected++
              expect(distance).toBeGreaterThan(reach)
            }
            if (delta <= 0) expect(separated).toBe(false)
            for (let index = 0; index < corners.length; index++) {
              const c = corners[index]!,
                d = corners[(index + 1) % corners.length]!
              if (
                areExpandedBoundsSeparated(
                  boundsOf([a, b]),
                  boundsOf([c, d]),
                  reach,
                )
              )
                expect(segmentToSegmentMinDistance(a, b, c, d)).toBeGreaterThan(
                  reach,
                )
            }
          }
        }
      }
    }
  }
  expect(rejected).toBeGreaterThan(0)
})
