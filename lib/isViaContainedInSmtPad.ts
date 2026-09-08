import type { SimpleRouteJson } from "high-density-repair03/lib"
import {
  getLocalObstacleGeometry,
  getLocalObstacleInteriorClearance,
} from "./obstacleDistanceGeometry"

/** Physical containment only; callers also require explicit policy and net identity. */
export function isViaContainedInSmtPad(
  point: { x: number; y: number },
  radius: number,
  obstacle: SimpleRouteJson["obstacles"][number],
): boolean {
  if (
    obstacle.kind !== "smt_pad" ||
    obstacle.layers.length !== 1 ||
    !["top", "bottom"].includes(obstacle.layers[0]!)
  )
    return false
  const angle = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const dx = point.x - obstacle.center.x,
    dy = point.y - obstacle.center.y
  const local = {
    x: dx * Math.cos(angle) + dy * Math.sin(angle),
    y: -dx * Math.sin(angle) + dy * Math.cos(angle),
  }
  return (
    getLocalObstacleInteriorClearance(local, getLocalObstacleGeometry(obstacle)) +
      1e-8 >=
    radius
  )
}
