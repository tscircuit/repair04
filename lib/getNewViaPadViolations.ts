import { getRepairViaGeometry } from "./getRepairViaGeometry"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

export type NewViaPadViolation = {
  key: string
  center: { x: number; y: number }
  routeIndex: number
  obstacleIndex: number
  kind: "via"
  /** Required edge clearance minus measured clearance, in millimeters. */
  severity: number
}

export type NewViaPadViolationInput = {
  srj: SimpleRouteJson
  /** Same route ordering as routes, before this repair stage changed geometry. */
  previousRoutes: readonly HighDensityRoute[]
  routes: readonly HighDensityRoute[]
  viaClearance?: number
  /** Optional existing via ordinals to score even before they move. */
  includeExistingVias?: readonly { routeIndex: number; viaIndex: number }[]
}

/**
 * New or moved vias must clear every obstacle, including same-net pads.
 * Ordinary electrical clearance checks allow same-net copper contact, which
 * does not imply permission to drill a via in a solder pad. Existing physical
 * vias are exempt only when their position, span and diameter are unchanged.
 */
export const getNewViaPadViolations = ({
  srj,
  previousRoutes,
  routes,
  viaClearance = 0.1,
  includeExistingVias = [],
}: NewViaPadViolationInput): NewViaPadViolation[] => {
  if (previousRoutes.length !== routes.length) {
    throw new Error("repair04 new-via guard requires matching route ordering")
  }
  const margins = [
    viaClearance,
    srj.defaultObstacleMargin ?? 0,
    srj.minViaEdgeToPadEdgeClearance ?? 0,
  ]
  if (
    margins.some((margin): boolean => !Number.isFinite(margin) || margin < 0)
  ) {
    throw new Error(
      "repair04 new-via guard requires nonnegative finite margins",
    )
  }
  const clearance = Math.max(...margins)
  const violations: NewViaPadViolation[] = []
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    const route = routes[routeIndex]!
    const previous = previousRoutes[routeIndex]!
    const unchanged = new Set(
      route.connectionName === previous.connectionName &&
        route.rootConnectionName === previous.rootConnectionName
        ? getRepairViaGeometry(previous, srj.layerCount).map(
            (via): string => via.identity,
          )
        : [],
    )
    const vias = getRepairViaGeometry(route, srj.layerCount)
    for (let viaIndex = 0; viaIndex < vias.length; viaIndex++) {
      const via = vias[viaIndex]!
      if (
        unchanged.has(via.identity) &&
        !includeExistingVias.some(
          (selected): boolean =>
            selected.routeIndex === routeIndex &&
            selected.viaIndex === viaIndex,
        )
      )
        continue
      for (
        let obstacleIndex = 0;
        obstacleIndex < srj.obstacles.length;
        obstacleIndex++
      ) {
        const obstacle = srj.obstacles[obstacleIndex]!
        const zs =
          (obstacle as typeof obstacle & { __zLayers?: number[] }).__zLayers ??
          obstacle.zLayers ??
          obstacle.layers.map((layer): number =>
            layer === "top"
              ? 0
              : layer === "bottom"
                ? srj.layerCount - 1
                : /^inner\d+$/.test(layer)
                  ? Number(layer.slice(5))
                  : -1,
          )
        if (
          zs.some(
            (z): boolean =>
              !Number.isInteger(z) || z < 0 || z >= srj.layerCount,
          )
        ) {
          throw new Error(
            "repair04 new-via guard found an unknown obstacle layer",
          )
        }
        if (!zs.some((z): boolean => z >= via.minZ && z <= via.maxZ)) continue
        if (
          ![
            obstacle.center.x,
            obstacle.center.y,
            obstacle.width,
            obstacle.height,
            obstacle.ccwRotationDegrees ?? 0,
          ].every(Number.isFinite) ||
          obstacle.width < 0 ||
          obstacle.height < 0
        ) {
          throw new Error(
            "repair04 new-via guard found invalid obstacle geometry",
          )
        }
        // Keep all layer/geometry validation above the conservative rejection.
        // The diagonal radius encloses the obstacle at every rotation.
        const reach =
          Math.hypot(obstacle.width, obstacle.height) / 2 +
          via.diameter / 2 +
          clearance +
          1e-8
        if (
          Math.abs(via.x - obstacle.center.x) > reach ||
          Math.abs(via.y - obstacle.center.y) > reach
        )
          continue
        const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
        const dx = via.x - obstacle.center.x
        const dy = via.y - obstacle.center.y
        const local = {
          x: dx * Math.cos(radians) + dy * Math.sin(radians),
          y: -dx * Math.sin(radians) + dy * Math.cos(radians),
        }
        const distance = segmentToBoundsMinDistance(local, local, {
          minX: -obstacle.width / 2,
          maxX: obstacle.width / 2,
          minY: -obstacle.height / 2,
          maxY: obstacle.height / 2,
        })
        const severity = via.diameter / 2 + clearance - distance
        if (severity <= 1e-8) continue
        violations.push({
          key: `new-via-pad:${routeIndex}:${obstacleIndex}:${viaIndex}`,
          routeIndex,
          obstacleIndex,
          center: { x: via.x, y: via.y },
          kind: "via",
          severity,
        })
      }
    }
  }
  return violations
}
