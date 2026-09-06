import {
  getRepairViaGeometry,
  type RepairViaGeometry,
} from "./getRepairViaGeometry"
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

type StaticContext = Pick<
  SimpleRouteJson,
  | "layerCount"
  | "obstacles"
  | "defaultObstacleMargin"
  | "minViaEdgeToPadEdgeClearance"
>
type RouteInput = Omit<NewViaPadViolationInput, "srj" | "viaClearance">
type Contact = { obstacleIndex: number; severity: number }
type PreparedObstacle = {
  zs: number[]
  geometry?: {
    x: number
    y: number
    cosine: number
    sine: number
    extent: number
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
  }
}

const createEvaluator = ({
  srj,
  viaClearance = 0.1,
}: {
  srj: StaticContext
  viaClearance?: number
}): ((input: RouteInput) => NewViaPadViolation[]) => {
  const preparedObstacles = new Map<number, PreparedObstacle>()
  const contactsByVia = new Map<string, Contact[]>()
  const margins = [
    viaClearance,
    srj.defaultObstacleMargin ?? 0,
    srj.minViaEdgeToPadEdgeClearance ?? 0,
  ]
  const clearance = Math.max(...margins)
  const getContacts = (via: RepairViaGeometry): Contact[] => {
    const cached = contactsByVia.get(via.identity)
    if (cached) return cached
    const contacts: Contact[] = []
    for (
      let obstacleIndex = 0;
      obstacleIndex < srj.obstacles.length;
      obstacleIndex++
    ) {
      const obstacle = srj.obstacles[obstacleIndex]!
      let prepared = preparedObstacles.get(obstacleIndex)
      if (!prepared) {
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
        )
          throw new Error(
            "repair04 new-via guard found an unknown obstacle layer",
          )
        prepared = { zs }
        preparedObstacles.set(obstacleIndex, prepared)
      }
      if (!prepared.zs.some((z): boolean => z >= via.minZ && z <= via.maxZ))
        continue
      // Geometry validation remains lazy: the original guard only validates
      // rectangles on a checked via's span, after validating all layer names.
      if (!prepared.geometry) {
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
        )
          throw new Error(
            "repair04 new-via guard found invalid obstacle geometry",
          )
        const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
        prepared.geometry = {
          x: obstacle.center.x,
          y: obstacle.center.y,
          cosine: Math.cos(radians),
          sine: Math.sin(radians),
          extent: Math.hypot(obstacle.width, obstacle.height) / 2,
          bounds: {
            minX: -obstacle.width / 2,
            maxX: obstacle.width / 2,
            minY: -obstacle.height / 2,
            maxY: obstacle.height / 2,
          },
        }
      }
      const geometry = prepared.geometry
      const reach = geometry.extent + via.diameter / 2 + clearance + 1e-8
      if (
        Math.abs(via.x - geometry.x) > reach ||
        Math.abs(via.y - geometry.y) > reach
      )
        continue
      const dx = via.x - geometry.x,
        dy = via.y - geometry.y
      const local = {
        x: dx * geometry.cosine + dy * geometry.sine,
        y: -dx * geometry.sine + dy * geometry.cosine,
      }
      const distance = segmentToBoundsMinDistance(local, local, geometry.bounds)
      const severity = via.diameter / 2 + clearance - distance
      if (severity <= 1e-8) continue
      contacts.push({ obstacleIndex, severity })
    }
    // Contact depends only on XY, inclusive layer span and copper diameter.
    // Owners and via ordinals are deliberately reconstructed by each caller.
    contactsByVia.set(via.identity, contacts)
    return contacts
  }
  return ({
    previousRoutes,
    routes,
    includeExistingVias = [],
  }): NewViaPadViolation[] => {
    if (previousRoutes.length !== routes.length)
      throw new Error("repair04 new-via guard requires matching route ordering")
    if (
      margins.some((margin): boolean => !Number.isFinite(margin) || margin < 0)
    )
      throw new Error(
        "repair04 new-via guard requires nonnegative finite margins",
      )
    const violations: NewViaPadViolation[] = []
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex]!,
        previous = previousRoutes[routeIndex]!
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
        for (const contact of getContacts(via))
          violations.push({
            key: `new-via-pad:${routeIndex}:${contact.obstacleIndex}:${viaIndex}`,
            routeIndex,
            obstacleIndex: contact.obstacleIndex,
            center: { x: via.x, y: via.y },
            kind: "via",
            severity: contact.severity,
          })
      }
    }
    return violations
  }
}

/**
 * Snapshot static pad context once for a solver. Physical contact results may
 * then be reused across candidate route objects without caching their owners,
 * ordinals, eligibility, or caller-visible mutable violation objects.
 */
export const createNewViaPadViolationEvaluator = ({
  srj,
  viaClearance,
}: Pick<NewViaPadViolationInput, "srj" | "viaClearance">): ((
  input: RouteInput,
) => NewViaPadViolation[]) =>
  createEvaluator({
    srj: {
      layerCount: srj.layerCount,
      obstacles: structuredClone(srj.obstacles),
      defaultObstacleMargin: srj.defaultObstacleMargin,
      minViaEdgeToPadEdgeClearance: srj.minViaEdgeToPadEdgeClearance,
    },
    viaClearance,
  })

/**
 * New or moved vias must clear every obstacle, including same-net pads.
 * Ordinary electrical clearance checks allow same-net copper contact, which
 * does not imply permission to drill a via in a solder pad. Existing physical
 * vias are exempt only when their position, span and diameter are unchanged.
 * Each public call observes its current input; caches never cross calls.
 */
export const getNewViaPadViolations = (
  input: NewViaPadViolationInput,
): NewViaPadViolation[] => createEvaluator(input)(input)
