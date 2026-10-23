import { doSegmentsIntersect } from "@tscircuit/math-utils"

type Point = { x: number; y: number }

export type PreparedSegment = {
  a: Point
  b: Point
  deltaX: number
  deltaY: number
  lengthSquared: number
}

const getPointDistanceSquared = (
  point: Point,
  segment: PreparedSegment,
): number => {
  const { a, deltaX, deltaY, lengthSquared } = segment
  if (lengthSquared === 0) {
    const dx = point.x - a.x
    const dy = point.y - a.y
    return dx * dx + dy * dy
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * deltaX + (point.y - a.y) * deltaY) / lengthSquared,
    ),
  )
  const dx = point.x - (a.x + t * deltaX)
  const dy = point.y - (a.y + t * deltaY)
  return dx * dx + dy * dy
}

export const getPreparedSegmentDistance = (
  left: PreparedSegment,
  right: PreparedSegment,
): number => {
  if (left.a.x === left.b.x && left.a.y === left.b.y) {
    return Math.sqrt(getPointDistanceSquared(left.a, right))
  }
  if (right.a.x === right.b.x && right.a.y === right.b.y) {
    return Math.sqrt(getPointDistanceSquared(right.a, left))
  }
  if (doSegmentsIntersect(left.a, left.b, right.a, right.b)) return 0
  // Square root is monotone: select the same minimum before taking it once.
  return Math.sqrt(
    Math.min(
      getPointDistanceSquared(left.a, right),
      getPointDistanceSquared(left.b, right),
      getPointDistanceSquared(right.a, left),
      getPointDistanceSquared(right.b, left),
    ),
  )
}
