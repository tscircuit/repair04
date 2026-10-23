import { clamp, doSegmentsIntersect } from "@tscircuit/math-utils"
import type { Bounds } from "./repairRegionTypes"

type Point = { x: number; y: number }

export type PreparedSegment = {
  a: Point
  b: Point
  deltaX: number
  deltaY: number
  lengthSquared: number
}

export type PreparedDistanceBounds = Bounds & {
  topLeft: Point
  topRight: Point
  bottomLeft: Point
  bottomRight: Point
}

export const prepareDistanceBounds = (bounds: Bounds): PreparedDistanceBounds => {
  return {
    ...bounds,
    topLeft: { x: bounds.minX, y: bounds.minY },
    topRight: { x: bounds.maxX, y: bounds.minY },
    bottomLeft: { x: bounds.minX, y: bounds.maxY },
    bottomRight: { x: bounds.maxX, y: bounds.maxY },
  }
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

export const getPreparedSegmentToBoundsDistance = (
  segment: PreparedSegment,
  bounds: PreparedDistanceBounds,
): number => {
  const { a, b } = segment
  const { topLeft, topRight, bottomLeft, bottomRight } = bounds
  if (
    (a.x >= bounds.minX &&
      a.x <= bounds.maxX &&
      a.y >= bounds.minY &&
      a.y <= bounds.maxY) ||
    (b.x >= bounds.minX &&
      b.x <= bounds.maxX &&
      b.y >= bounds.minY &&
      b.y <= bounds.maxY)
  ) {
    return 0
  }
  if (
    doSegmentsIntersect(a, b, topLeft, topRight) ||
    doSegmentsIntersect(a, b, topRight, bottomRight) ||
    doSegmentsIntersect(a, b, bottomRight, bottomLeft) ||
    doSegmentsIntersect(a, b, bottomLeft, topLeft)
  ) {
    return 0
  }
  const ax = a.x - clamp(a.x, bounds.minX, bounds.maxX)
  const ay = a.y - clamp(a.y, bounds.minY, bounds.maxY)
  const bx = b.x - clamp(b.x, bounds.minX, bounds.maxX)
  const by = b.y - clamp(b.y, bounds.minY, bounds.maxY)
  return Math.sqrt(
    Math.min(
      getPointDistanceSquared(topLeft, segment),
      getPointDistanceSquared(topRight, segment),
      getPointDistanceSquared(bottomLeft, segment),
      getPointDistanceSquared(bottomRight, segment),
      ax * ax + ay * ay,
      bx * bx + by * by,
    ),
  )
}
