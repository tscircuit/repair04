import {
  pointToSegmentClosestPoint,
  segmentToBoundsMinDistance,
} from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import type { RepairRoutePoint } from "./repairRegionTypes"

export type FixedObstacleViolation = {
  /** Geometry-independent identity, stable when points are inserted or moved. */
  key: string
  center: { x: number; y: number }
  routeIndex: number
  obstacleIndex: number
  kind: "wire" | "via"
  /** Required edge clearance minus measured clearance, in millimeters. */
  severity: number
}

export type FixedObstacleViolationInput = {
  srj: SimpleRouteJson
  routes: HighDensityRoute[]
  traceClearance?: number
  viaClearance?: number
}

type Obstacle = SimpleRouteJson["obstacles"][number]
type Point = { x: number; y: number }

const getNetRepresentatives = (
  srj: SimpleRouteJson,
  routes: HighDensityRoute[],
): Map<string, string> => {
  const parents = new Map<string, string>()
  const find = (name: string): string => {
    const parent = parents.get(name)
    if (parent === undefined) {
      parents.set(name, name)
      return name
    }
    if (parent === name) return name
    const root = find(parent)
    parents.set(name, root)
    return root
  }
  const union = (names: Array<string | undefined>): void => {
    const present = names.filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    )
    if (present.length === 0) return
    const root = find(present[0]!)
    for (const name of present) parents.set(find(name), root)
  }
  for (const original of srj.connections) {
    const connection = original as typeof original & {
      __rootConnectionNames?: string[]
      __netConnectionName?: string
    }
    union([
      connection.name,
      connection.rootConnectionName,
      connection.netConnectionName,
      connection.__netConnectionName,
      ...(connection.mergedConnectionNames ?? []),
      ...(connection.__rootConnectionNames ?? []),
      ...connection.pointsToConnect.flatMap((point) => [
        point.pointId,
        point.pcb_port_id,
      ]),
    ])
  }
  for (const obstacle of srj.obstacles) union(obstacle.connectedTo)
  for (const route of routes)
    union([route.connectionName, route.rootConnectionName])
  for (const name of parents.keys()) parents.set(name, find(name))
  return parents
}

const getObstacleZLayers = (
  obstacle: Obstacle,
  layerCount: number,
): Set<number> => {
  const canonical = (obstacle as Obstacle & { __zLayers?: number[] }).__zLayers
  if (canonical) return new Set(canonical)
  if (obstacle.zLayers) return new Set(obstacle.zLayers)
  const layers = new Set<number>()
  for (const layer of obstacle.layers) {
    const z =
      layer === "top"
        ? 0
        : layer === "bottom"
          ? layerCount - 1
          : /^inner\d+$/.test(layer)
            ? Number(layer.slice(5))
            : -1
    if (z < 0 || z >= layerCount)
      throw new Error(`repair04 obstacle has an unknown layer: ${layer}`)
    layers.add(z)
  }
  return layers
}

const toObstacleCoordinates = (point: Point, obstacle: Obstacle): Point => {
  const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const dx = point.x - obstacle.center.x
  const dy = point.y - obstacle.center.y
  return {
    x: dx * Math.cos(radians) + dy * Math.sin(radians),
    y: -dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

/**
 * Supplement repair03's pad DRC with generic keepouts and exact rotated
 * rectangles. Axis-aligned recognized pads remain with the existing engine.
 */
export const getFixedObstacleViolations = ({
  srj,
  routes,
  traceClearance = 0.1,
  viaClearance = 0.1,
}: FixedObstacleViolationInput): FixedObstacleViolation[] => {
  const nets = getNetRepresentatives(srj, routes)
  const violations = new Map<string, FixedObstacleViolation>()
  for (
    let obstacleIndex = 0;
    obstacleIndex < srj.obstacles.length;
    obstacleIndex += 1
  ) {
    const obstacle = srj.obstacles[obstacleIndex]!
    const recognizedPad = obstacle.connectedTo.some((id) =>
      /^(pcb_smtpad_|pcb_plated_hole_|pcb_port_)/.test(id),
    )
    const rotated = Math.abs((obstacle.ccwRotationDegrees ?? 0) % 180) > 1e-8
    if (recognizedPad && !rotated) continue
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
        "repair04 fixed obstacle geometry must be finite and nonnegative",
      )
    }
    const zLayers = getObstacleZLayers(obstacle, srj.layerCount)
    const obstacleNets = new Set(
      obstacle.connectedTo.map((name) => nets.get(name) ?? name),
    )
    const obstacleBounds = {
      minX: -obstacle.width / 2,
      maxX: obstacle.width / 2,
      minY: -obstacle.height / 2,
      maxY: obstacle.height / 2,
    }
    const isBoardEdge =
      obstacle.obstacleId?.startsWith("repair04_board_edge_") === true
    const wireGap = isBoardEdge
      ? 0
      : Math.max(
          traceClearance,
          srj.defaultObstacleMargin ?? 0,
          srj.minTraceToPadEdgeClearance ?? 0,
        )
    const viaGap = isBoardEdge
      ? 0
      : Math.max(
          viaClearance,
          srj.defaultObstacleMargin ?? 0,
          srj.minViaEdgeToPadEdgeClearance ?? 0,
        )
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const route = routes[routeIndex]!
      if (
        [route.connectionName, route.rootConnectionName].some(
          (name) =>
            name !== undefined && obstacleNets.has(nets.get(name) ?? name),
        )
      )
        continue
      for (
        let pointIndex = 1;
        pointIndex < route.route.length;
        pointIndex += 1
      ) {
        const start = route.route[pointIndex - 1]! as RepairRoutePoint
        const end = route.route[pointIndex]! as RepairRoutePoint
        if (start.toNextSegmentType === "through_obstacle") continue
        const localStart = toObstacleCoordinates(start, obstacle)
        const localEnd = toObstacleCoordinates(end, obstacle)
        if (start.z !== end.z) {
          if (
            !Array.from(zLayers).some(
              (z) =>
                z >= Math.min(start.z, end.z) && z <= Math.max(start.z, end.z),
            )
          )
            continue
          if (
            Math.abs(start.x - end.x) > 1e-8 ||
            Math.abs(start.y - end.y) > 1e-8
          )
            throw new Error("repair04 found a non-colocated via transition")
          const distance = segmentToBoundsMinDistance(
            localStart,
            localStart,
            obstacleBounds,
          )
          const severity = route.viaDiameter / 2 + viaGap - distance
          if (severity <= 1e-8) continue
          const key = `fixed-obstacle:${routeIndex}:${obstacleIndex}:via`
          if ((violations.get(key)?.severity ?? -Infinity) < severity)
            violations.set(key, {
              key,
              center: { x: start.x, y: start.y },
              routeIndex,
              obstacleIndex,
              kind: "via",
              severity,
            })
          continue
        }
        if (!zLayers.has(start.z)) continue
        const radius =
          Math.max(
            start.traceThickness ?? route.traceThickness,
            end.traceThickness ?? route.traceThickness,
          ) / 2
        const distance = segmentToBoundsMinDistance(
          localStart,
          localEnd,
          obstacleBounds,
        )
        const severity = radius + wireGap - distance
        if (severity <= 1e-8) continue
        const key = `fixed-obstacle:${routeIndex}:${obstacleIndex}:wire`
        if ((violations.get(key)?.severity ?? -Infinity) < severity)
          violations.set(key, {
            key,
            center: pointToSegmentClosestPoint(obstacle.center, start, end),
            routeIndex,
            obstacleIndex,
            kind: "wire",
            severity,
          })
      }
    }
  }
  return Array.from(violations.values())
}
