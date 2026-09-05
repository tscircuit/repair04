import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { extractFixedTraceContext } from "./extractFixedTraceContext"
import {
  getRepairJunctionAnchors,
  type RepairJunctionAnchors,
} from "./getRepairJunctionAnchors"
import {
  getSegmentBoundsInterval,
  getRepairSourceStateKey,
  interpolateRepairPoint,
  isPointInBounds,
  REGION_EPSILON,
  sameRepairPoint,
} from "./repairRegionGeometry"
import type {
  Bounds,
  ExtractedRepairRegion,
  ExtractRepairRegionOptions,
  RepairRegionRouteMapping,
  RepairRoutePoint,
  RepairRoutePosition,
} from "./repairRegionTypes"

type LocalFragment = {
  points: RepairRoutePoint[]
  locks: boolean[]
  start: RepairRoutePosition
  end: RepairRoutePosition
}
type Obstacle = SimpleRouteJson["obstacles"][number]

const validateBounds = (bounds: Bounds): void => {
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new Error("repair04 bounds must contain finite coordinates")
  }
  if (
    bounds.maxX - bounds.minX < 10 - REGION_EPSILON ||
    bounds.maxY - bounds.minY < 10 - REGION_EPSILON
  ) {
    throw new Error("repair04 requires bounds at least 10 mm by 10 mm")
  }
}

const expandBounds = (bounds: Bounds, amount: number): Bounds => {
  return {
    minX: bounds.minX - amount,
    maxX: bounds.maxX + amount,
    minY: bounds.minY - amount,
    maxY: bounds.maxY + amount,
  }
}

const obstacleOverlapsBounds = (
  obstacle: Obstacle,
  bounds: Bounds,
): boolean => {
  const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const radiusX =
    (Math.abs(obstacle.width * Math.cos(radians)) +
      Math.abs(obstacle.height * Math.sin(radians))) /
    2
  const radiusY =
    (Math.abs(obstacle.width * Math.sin(radians)) +
      Math.abs(obstacle.height * Math.cos(radians))) /
    2
  return (
    obstacle.center.x + radiusX >= bounds.minX &&
    obstacle.center.x - radiusX <= bounds.maxX &&
    obstacle.center.y + radiusY >= bounds.minY &&
    obstacle.center.y - radiusY <= bounds.maxY
  )
}

const getFragments = (
  route: HighDensityRoute,
  contextBounds: Bounds,
  mutableBounds: Bounds,
  junctions: RepairJunctionAnchors,
): LocalFragment[] => {
  const fragments: LocalFragment[] = []
  let active: LocalFragment | undefined
  const points = route.route as RepairRoutePoint[]
  const isOriginalTerminal = (index: number): boolean => {
    return (
      index === 0 ||
      index === points.length - 1 ||
      points[index]?.pcb_port_id !== undefined
    )
  }
  const finish = (): void => {
    if (active !== undefined && active.points.length > 0) {
      active.locks[0] = true
      active.locks[active.points.length - 1] = true
      fragments.push(active)
    }
    active = undefined
  }
  if (
    points.length === 1 &&
    points[0] &&
    isPointInBounds(points[0], contextBounds)
  ) {
    return [
      {
        points: structuredClone(points),
        locks: [true],
        start: { segmentIndex: 0, t: 0 },
        end: { segmentIndex: 0, t: 0 },
      },
    ]
  }
  for (
    let segmentIndex = 0;
    segmentIndex < points.length - 1;
    segmentIndex += 1
  ) {
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    if (!start || !end) throw new Error("repair04 found a missing route point")
    if (
      ![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)
    ) {
      throw new Error("repair04 route coordinates must be finite")
    }
    if (
      start.z !== end.z &&
      !sameRepairPoint({ x: start.x, y: start.y }, { x: end.x, y: end.y }) &&
      start.toNextSegmentType !== "through_obstacle"
    ) {
      throw new Error("repair04 requires colocated points at a via transition")
    }
    const interval = getSegmentBoundsInterval(start, end, contextBounds)
    if (!interval) {
      finish()
      continue
    }
    const [startT, endT] = interval
    // Isolated tangencies have no copper centerline inside the crop.
    if (endT - startT <= REGION_EPSILON && !sameRepairPoint(start, end)) {
      finish()
      continue
    }
    const insideInterval = getSegmentBoundsInterval(start, end, mutableBounds)
    const times = [startT, endT]
    const junctionTimes = junctions.segmentTimes.get(segmentIndex) ?? []
    for (const t of junctionTimes) {
      if (t >= startT - REGION_EPSILON && t <= endT + REGION_EPSILON)
        times.push(Math.max(startT, Math.min(endT, t)))
    }
    if (insideInterval && start.z === end.z) {
      for (const t of insideInterval) {
        if (t > startT + REGION_EPSILON && t < endT - REGION_EPSILON)
          times.push(t)
      }
    }
    times.sort((left, right) => left - right)
    const uniqueTimes = times.filter(
      (t, index) =>
        index === 0 || Math.abs(t - times[index - 1]!) > REGION_EPSILON,
    )
    const first = interpolateRepairPoint(start, end, startT)
    if (
      active &&
      !sameRepairPoint(active.points[active.points.length - 1]!, first)
    )
      finish()
    if (!active)
      active = {
        points: [],
        locks: [],
        start: { segmentIndex, t: startT },
        end: { segmentIndex, t: endT },
      }
    for (const t of uniqueTimes) {
      const point = interpolateRepairPoint(start, end, t)
      const onOriginalPoint =
        t <= REGION_EPSILON
          ? segmentIndex
          : t >= 1 - REGION_EPSILON
            ? segmentIndex + 1
            : undefined
      const fixed =
        !isPointInBounds(point, mutableBounds, REGION_EPSILON * 4) ||
        junctionTimes.some(
          (junctionT) => Math.abs(junctionT - t) <= REGION_EPSILON,
        ) ||
        junctions.viaPositions.some(
          (via) =>
            Math.hypot(via.x - point.x, via.y - point.y) <= REGION_EPSILON,
        ) ||
        (onOriginalPoint !== undefined &&
          isOriginalTerminal(onOriginalPoint)) ||
        start.toNextSegmentType === "through_obstacle" ||
        point.toNextSegmentType === "through_obstacle" ||
        start.insideJumperPad === true ||
        end.insideJumperPad === true ||
        (route.jumpers ?? []).some(
          (jumper) =>
            sameRepairPoint(point, { ...jumper.start, z: point.z }) ||
            sameRepairPoint(point, { ...jumper.end, z: point.z }),
        )
      const lastPoint = active.points[active.points.length - 1]
      if (lastPoint && sameRepairPoint(lastPoint, point)) {
        active.locks[active.locks.length - 1] =
          active.locks[active.locks.length - 1]! || fixed
      } else {
        active.points.push(point)
        active.locks.push(fixed)
      }
    }
    active.end = { segmentIndex, t: endT }
    if (endT < 1 - REGION_EPSILON) finish()
  }
  finish()
  for (const fragment of fragments) {
    // Via sides move as one; locking either side locks the entire stack.
    for (
      let pointIndex = 1;
      pointIndex < fragment.points.length;
      pointIndex += 1
    ) {
      const previous = fragment.points[pointIndex - 1]!
      const current = fragment.points[pointIndex]!
      if (
        previous.z !== current.z &&
        (fragment.locks[pointIndex - 1] || fragment.locks[pointIndex])
      ) {
        let first = pointIndex - 1
        let last = pointIndex
        while (
          first > 0 &&
          sameRepairPoint(
            {
              x: fragment.points[first - 1]!.x,
              y: fragment.points[first - 1]!.y,
            },
            { x: current.x, y: current.y },
          )
        )
          first -= 1
        while (
          last + 1 < fragment.points.length &&
          sameRepairPoint(
            {
              x: fragment.points[last + 1]!.x,
              y: fragment.points[last + 1]!.y,
            },
            { x: current.x, y: current.y },
          )
        )
          last += 1
        for (let index = first; index <= last; index += 1)
          fragment.locks[index] = true
      }
    }
  }
  return fragments
}

const getLocalBoardEdgeObstacles = (
  srj: SimpleRouteJson,
  contextBounds: Bounds,
): Obstacle[] => {
  const bounds = srj.bounds
  const polygon =
    srj.outline && srj.outline.length >= 3
      ? srj.outline
      : [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
        ]
  const edges: Obstacle[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!
    const end = polygon[(index + 1) % polygon.length]!
    const interval = getSegmentBoundsInterval(start, end, contextBounds)
    if (!interval) continue
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length <= REGION_EPSILON) continue
    const midpointT = (interval[0] + interval[1]) / 2
    edges.push({
      obstacleId: `repair04_board_edge_${index}`,
      type: "rect",
      center: { x: start.x + dx * midpointT, y: start.y + dy * midpointT },
      width: length * (interval[1] - interval[0]),
      height: Math.max(2 * (srj.minBoardEdgeClearance ?? 0), REGION_EPSILON),
      ccwRotationDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
      layers: Array.from({ length: srj.layerCount }, (_, z) =>
        z === 0 ? "top" : z === srj.layerCount - 1 ? "bottom" : `inner${z}`,
      ),
      zLayers: Array.from({ length: srj.layerCount }, (_, z) => z),
      connectedTo: [],
    })
  }
  return edges
}

/**
 * Clip a routed board into a serializable local problem. Only the caller keeps
 * source-route indexes; the solver receives bounded geometry and lock masks.
 * All cuts are exact: terminal positions are never shifted to avoid aliases.
 */
export const extractRepairRegion = ({
  srj,
  routes,
  bounds,
  boundaryMargin: requestedMargin = 0.5,
  clearanceHalo,
}: ExtractRepairRegionOptions): ExtractedRepairRegion => {
  validateBounds(bounds)
  if (
    !Number.isFinite(requestedMargin) ||
    requestedMargin < 0 ||
    (clearanceHalo !== undefined &&
      (!Number.isFinite(clearanceHalo) || clearanceHalo < 0))
  ) {
    throw new Error("repair04 collar and halo must be finite and nonnegative")
  }
  const clearance = Math.max(
    srj.defaultObstacleMargin ?? 0.2,
    srj.minTraceToPadEdgeClearance ?? 0,
    srj.minViaEdgeToPadEdgeClearance ?? 0,
  )
  let maxCopperDiameter = Math.max(srj.minTraceWidth, srj.minViaDiameter ?? 0)
  for (const route of routes) {
    maxCopperDiameter = Math.max(
      maxCopperDiameter,
      route.traceThickness,
      route.viaDiameter,
    )
    for (const point of route.route as RepairRoutePoint[])
      maxCopperDiameter = Math.max(maxCopperDiameter, point.traceThickness ?? 0)
  }
  for (const trace of srj.traces ?? []) {
    for (const token of trace.route) {
      if (token.route_type === "wire")
        maxCopperDiameter = Math.max(maxCopperDiameter, token.width)
      if (token.route_type === "via")
        maxCopperDiameter = Math.max(
          maxCopperDiameter,
          token.via_diameter ?? srj.minViaDiameter ?? 0.3,
        )
    }
  }
  if (!Number.isFinite(maxCopperDiameter) || maxCopperDiameter <= 0)
    throw new Error("repair04 requires finite positive copper widths")
  // A fixed collar at least one copper diameter plus clearance prevents copper
  // just beyond the crop from interacting with any modified copper inside it.
  const boundaryMargin = Math.max(
    requestedMargin,
    maxCopperDiameter + clearance,
  )
  if (
    boundaryMargin * 2 >=
    Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
  ) {
    throw new Error(
      "repair04 bounds are too small for their required copper safety collar",
    )
  }
  const contextBounds = expandBounds(
    bounds,
    Math.max(clearanceHalo ?? boundaryMargin, clearance + maxCopperDiameter),
  )
  const mutableBounds = expandBounds(bounds, -boundaryMargin)
  const junctionsByRoute = getRepairJunctionAnchors(srj, routes, contextBounds)
  const localFixedTraces = extractFixedTraceContext(
    srj.traces ?? [],
    contextBounds,
    srj.minTraceWidth,
  )
  const localRoutes: HighDensityRoute[] = []
  const lockedPointIndices: boolean[][] = []
  const routeMappings: RepairRegionRouteMapping[] = []
  for (
    let sourceRouteIndex = 0;
    sourceRouteIndex < routes.length;
    sourceRouteIndex += 1
  ) {
    const route = routes[sourceRouteIndex]!
    for (const fragment of getFragments(
      route,
      contextBounds,
      mutableBounds,
      junctionsByRoute[sourceRouteIndex]!,
    )) {
      const localRoute: HighDensityRoute = {
        ...structuredClone(
          Object.fromEntries(
            Object.entries(route).filter(
              ([key]) => key !== "route" && key !== "vias" && key !== "jumpers",
            ),
          ),
        ),
        connectionName: route.connectionName,
        traceThickness: route.traceThickness,
        viaDiameter: route.viaDiameter,
        route: fragment.points,
        vias: route.vias
          .filter((via) =>
            fragment.points.some(
              (point) =>
                Math.abs(point.x - via.x) <= REGION_EPSILON &&
                Math.abs(point.y - via.y) <= REGION_EPSILON,
            ),
          )
          .map((via) => structuredClone(via)),
        ...(route.jumpers !== undefined
          ? {
              jumpers: route.jumpers
                .filter(
                  (jumper) =>
                    getSegmentBoundsInterval(
                      jumper.start,
                      jumper.end,
                      contextBounds,
                    ) !== undefined,
                )
                .map((jumper) => structuredClone(jumper)),
            }
          : {}),
      }
      localRoutes.push(localRoute)
      lockedPointIndices.push(fragment.locks)
      routeMappings.push({
        sourceRouteIndex,
        start: fragment.start,
        end: fragment.end,
        sourceGeometryKey: getRepairSourceStateKey(
          route,
          fragment.start.segmentIndex + fragment.start.t,
          fragment.end.segmentIndex + fragment.end.t,
        ),
        originalFragment: structuredClone(localRoute),
      })
    }
  }
  const localNames = new Set([
    ...localRoutes.flatMap((route) => [
      route.connectionName,
      ...(route.rootConnectionName ? [route.rootConnectionName] : []),
    ]),
    ...localFixedTraces.map((trace) => trace.connection_name),
  ])
  const connections = srj.connections
    .filter(
      (connection) =>
        localNames.has(connection.name) ||
        connection.pointsToConnect.some((point) =>
          isPointInBounds(point, contextBounds),
        ),
    )
    .map((connection) => ({
      ...structuredClone(
        Object.fromEntries(
          Object.entries(connection).filter(
            ([key]) => key !== "pointsToConnect",
          ),
        ),
      ),
      name: connection.name,
      pointsToConnect: connection.pointsToConnect
        .filter((point) => isPointInBounds(point, contextBounds))
        .map((point) => structuredClone(point)),
    }))
  for (let index = 0; index < localRoutes.length; index += 1) {
    const route = localRoutes[index]!
    let connection = connections.find(
      (candidate) => candidate.name === route.connectionName,
    )
    if (!connection) {
      connection = {
        name: route.connectionName,
        ...(route.rootConnectionName
          ? { rootConnectionName: route.rootConnectionName }
          : {}),
        pointsToConnect: [],
      }
      connections.push(connection)
    }
    for (const [endName, point] of [
      ["start", route.route[0]],
      ["end", route.route[route.route.length - 1]],
    ] as const) {
      if (!point) continue
      const layer =
        point.z === 0
          ? "top"
          : point.z === srj.layerCount - 1
            ? "bottom"
            : `inner${point.z}`
      if (
        !connection.pointsToConnect.some(
          (candidate) =>
            Math.abs(candidate.x - point.x) <= REGION_EPSILON &&
            Math.abs(candidate.y - point.y) <= REGION_EPSILON &&
            ("layer" in candidate
              ? candidate.layer === layer
              : candidate.layers.includes(layer)),
        )
      ) {
        connection.pointsToConnect.push({
          x: point.x,
          y: point.y,
          layer,
          pointId: `repair04_${index}_${endName}`,
          ...(point.pcb_port_id ? { pcb_port_id: point.pcb_port_id } : {}),
        })
      }
    }
  }
  // Copy scalar settings only. In particular, do not clone sourceCircuitJson,
  // sourceKicadPcb, full trace lists, or another embedded copy of the board.
  const settings = Object.fromEntries(
    Object.entries(srj).filter(
      ([key, value]) =>
        key !== "sourceCircuitJson" &&
        key !== "sourceKicadPcb" &&
        (typeof value === "number" ||
          typeof value === "boolean" ||
          typeof value === "string"),
    ),
  )
  const localSrj: SimpleRouteJson = {
    ...settings,
    layerCount: srj.layerCount,
    minTraceWidth: srj.minTraceWidth,
    bounds: structuredClone(contextBounds),
    obstacles: [
      ...srj.obstacles
        .filter((obstacle) => obstacleOverlapsBounds(obstacle, contextBounds))
        .map((obstacle) => structuredClone(obstacle)),
      ...getLocalBoardEdgeObstacles(srj, contextBounds),
    ],
    connections,
    ...(srj.traces !== undefined ? { traces: localFixedTraces } : {}),
    ...(srj.allowJumpers !== undefined
      ? { allowJumpers: srj.allowJumpers }
      : {}),
    ...(srj.availableJumperTypes
      ? { availableJumperTypes: structuredClone(srj.availableJumperTypes) }
      : {}),
  }
  return {
    srj: localSrj,
    routes: localRoutes,
    bounds: structuredClone(bounds),
    contextBounds,
    mutableBounds,
    boundaryMargin,
    lockedPointIndices,
    routeMappings,
  }
}
