import {
  clamp,
  distance,
  segmentToBoundsMinDistance,
  segmentToSegmentMinDistance,
} from "@tscircuit/math-utils"
import type { SimpleRouteJson } from "high-density-repair03/lib"

type Point = { x: number; y: number }
export type ObstacleDistanceGeometry =
  | {
      type: "rect"
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
    }
  | { type: "oval"; a: Point; b: Point; radius: number }

export function getLocalObstacleGeometry(
  obstacle: SimpleRouteJson["obstacles"][number],
): ObstacleDistanceGeometry {
  if (obstacle.isNonPlatedHole && obstacle.shape === "circle") {
    return {
      type: "oval",
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      radius: obstacle.width / 2,
    }
  }
  if (obstacle.type === "rect") {
    return {
      type: "rect",
      bounds: {
        minX: -obstacle.width / 2,
        maxX: obstacle.width / 2,
        minY: -obstacle.height / 2,
        maxY: obstacle.height / 2,
      },
    }
  }
  if (obstacle.type !== "oval")
    throw new Error("repair04 found an unsupported obstacle shape")
  const halfSpine = Math.abs(obstacle.width - obstacle.height) / 2
  const dx = obstacle.width >= obstacle.height ? halfSpine : 0
  const dy = obstacle.height > obstacle.width ? halfSpine : 0
  return {
    type: "oval",
    a: { x: -dx, y: -dy },
    b: { x: dx, y: dy },
    radius: Math.min(obstacle.width, obstacle.height) / 2,
  }
}

export function getLocalObstacleDistance(
  a: Point,
  b: Point,
  geometry: ObstacleDistanceGeometry,
): number {
  if (geometry.type === "rect") {
    if (a.x === b.x && a.y === b.y) {
      // A point's nearest rectangle position is its coordinate-wise clamp.
      // Keep the distance arithmetic used by segmentToBoundsMinDistance.
      return distance(a, {
        x: clamp(a.x, geometry.bounds.minX, geometry.bounds.maxX),
        y: clamp(a.y, geometry.bounds.minY, geometry.bounds.maxY),
      })
    }
    return segmentToBoundsMinDistance(a, b, geometry.bounds)
  }
  return Math.max(
    0,
    segmentToSegmentMinDistance(a, b, geometry.a, geometry.b) - geometry.radius,
  )
}

/** Drill repair uses physical circular pads without changing ordinary repair geometry. */
export function getLocalPadDrillGeometry(
  obstacle: SimpleRouteJson["obstacles"][number],
): ObstacleDistanceGeometry {
  if (obstacle.shape === "circle") {
    return {
      type: "oval",
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      radius: obstacle.width / 2,
    }
  }
  return getLocalObstacleGeometry(obstacle)
}
