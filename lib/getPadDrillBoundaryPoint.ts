import type { SimpleRouteJson } from "high-density-repair03/lib"
import {
  getLocalObstacleDistance,
  getLocalObstacleGeometry,
} from "./obstacleDistanceGeometry"

type Point = { x: number; y: number }
type BoundaryInput = {
  obstacle: SimpleRouteJson["obstacles"][number]
  holeDiameter: number
  angle: number
}

/** Project a drill to the actual rotated pad boundary, leaving a small positive gap. */
export function getPadDrillBoundaryPoint({
  obstacle,
  holeDiameter,
  angle,
}: BoundaryInput): Point {
  const geometry = getLocalObstacleGeometry(obstacle)
  const rotation = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const cosine = Math.cos(angle - rotation)
  const sine = Math.sin(angle - rotation)
  let lower = 0
  let upper =
    Math.hypot(obstacle.width, obstacle.height) / 2 + holeDiameter / 2 + 1e-4
  for (let iteration = 0; iteration < 32; iteration++) {
    const radius = (lower + upper) / 2
    const point = { x: radius * cosine, y: radius * sine }
    const gap =
      getLocalObstacleDistance(point, point, geometry) - holeDiameter / 2
    if (gap < 1e-4) lower = radius
    else upper = radius
  }
  return {
    x: obstacle.center.x + upper * Math.cos(angle),
    y: obstacle.center.y + upper * Math.sin(angle),
  }
}
