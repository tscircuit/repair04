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
}

type Via = {
  x: number
  y: number
  minZ: number
  maxZ: number
  diameter: number
  identity: string
}

const getVias = (route: HighDensityRoute, layerCount: number): Via[] => {
  const vias: Via[] = []
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!
    const b = route.route[i]!
    if (a.z === b.z) continue
    if (
      a.x !== b.x ||
      a.y !== b.y ||
      ![a.x, a.y, a.z, b.z, route.viaDiameter].every(Number.isFinite) ||
      !Number.isInteger(a.z) ||
      !Number.isInteger(b.z) ||
      Math.min(a.z, b.z) < 0 ||
      Math.max(a.z, b.z) >= layerCount ||
      route.viaDiameter <= 0
    ) {
      throw new Error("repair04 new-via guard requires valid colocated vias")
    }
    let minZ = Math.min(a.z, b.z)
    let maxZ = Math.max(a.z, b.z)
    // Redundant wire vertices or explicit intermediate layers do not create a
    // different physical via. Its identity is the entire coincident span.
    while (i + 1 < route.route.length) {
      const next = route.route[i + 1]!
      if (next.x !== b.x || next.y !== b.y) break
      if (!Number.isInteger(next.z) || next.z < 0 || next.z >= layerCount) {
        throw new Error("repair04 new-via guard found an invalid layer span")
      }
      minZ = Math.min(minZ, next.z)
      maxZ = Math.max(maxZ, next.z)
      i++
    }
    vias.push({
      x: b.x,
      y: b.y,
      minZ,
      maxZ,
      diameter: route.viaDiameter,
      identity: JSON.stringify([b.x, b.y, minZ, maxZ, route.viaDiameter]),
    })
  }
  return vias
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
        ? getVias(previous, srj.layerCount).map((via): string => via.identity)
        : [],
    )
    const vias = getVias(route, srj.layerCount)
    for (let viaIndex = 0; viaIndex < vias.length; viaIndex++) {
      const via = vias[viaIndex]!
      if (unchanged.has(via.identity)) continue
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
