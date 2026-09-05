import type { HighDensityRoute } from "high-density-repair03/lib"
import {
  getSegmentBoundsInterval,
  getRepairSourceSpan,
  getRepairSourceStateKey,
  interpolateRepairPoint,
  isPointInBounds,
  REGION_EPSILON,
  repairValueKey,
  sameRepairPoint,
} from "./repairRegionGeometry"
import type {
  Bounds,
  MergeRepairRegionOptions,
  RepairRegionRouteMapping,
  RepairRoutePoint,
  RepairRoutePosition,
} from "./repairRegionTypes"

const routeMetadataKey = (route: HighDensityRoute): string => {
  return repairValueKey(
    Object.fromEntries(
      Object.entries(route).filter(
        ([key]) => key !== "route" && key !== "vias",
      ),
    ),
  )
}

const getExteriorSegments = (
  route: HighDensityRoute,
  bounds: Bounds,
): string[] => {
  const exterior: string[] = []
  for (let index = 1; index < route.route.length; index += 1) {
    const start = route.route[index - 1]!
    const end = route.route[index]!
    const interval = getSegmentBoundsInterval(start, end, bounds)
    const fractions: [number, number][] = !interval
      ? [[0, 1]]
      : [
          ...(interval[0] > REGION_EPSILON
            ? [[0, interval[0]] as [number, number]]
            : []),
          ...(interval[1] < 1 - REGION_EPSILON
            ? [[interval[1], 1] as [number, number]]
            : []),
        ]
    // A segment on the mutable rectangle border is still in the fixed collar.
    if (
      interval &&
      !isPointInBounds(
        interpolateRepairPoint(start, end, 0.5),
        bounds,
        REGION_EPSILON * 4,
      ) &&
      fractions.length === 0
    ) {
      fractions.push([0, 1])
    }
    for (const [first, last] of fractions) {
      exterior.push(
        repairValueKey([
          interpolateRepairPoint(start, end, first),
          interpolateRepairPoint(start, end, last),
        ]),
      )
    }
  }
  return exterior
}

const assertSafeFragment = (
  original: HighDensityRoute,
  repaired: HighDensityRoute,
  locks: boolean[],
  mutableBounds: Bounds,
  contextBounds: Bounds,
  layerCount: number,
): void => {
  if (routeMetadataKey(original) !== routeMetadataKey(repaired)) {
    throw new Error(
      "repair04 merge rejected changed net, width, jumper, or route metadata",
    )
  }
  if (locks.length !== original.route.length)
    throw new Error("repair04 merge received an invalid lock mask")
  if (repaired.route.length === 0)
    throw new Error("repair04 merge rejected an empty replacement route")
  if (
    repairValueKey(original.route[0]) !== repairValueKey(repaired.route[0]) ||
    repairValueKey(original.route[original.route.length - 1]) !==
      repairValueKey(repaired.route[repaired.route.length - 1])
  ) {
    throw new Error("repair04 merge rejected a moved fragment endpoint")
  }
  let nextCandidateIndex = 0
  for (
    let pointIndex = 0;
    pointIndex < original.route.length;
    pointIndex += 1
  ) {
    if (!locks[pointIndex]) continue
    const fixedKey = repairValueKey(original.route[pointIndex])
    while (
      nextCandidateIndex < repaired.route.length &&
      repairValueKey(repaired.route[nextCandidateIndex]) !== fixedKey
    )
      nextCandidateIndex += 1
    if (nextCandidateIndex === repaired.route.length)
      throw new Error("repair04 merge rejected a moved or removed locked point")
    nextCandidateIndex += 1
  }
  if (
    repairValueKey(getExteriorSegments(original, mutableBounds)) !==
    repairValueKey(getExteriorSegments(repaired, mutableBounds))
  ) {
    throw new Error(
      "repair04 merge rejected modified geometry in the fixed boundary collar",
    )
  }
  for (let index = 1; index < original.route.length; index += 1) {
    const start = original.route[index - 1]!
    const end = original.route[index]!
    const atomic =
      start.toNextSegmentType === "through_obstacle" ||
      start.insideJumperPad === true ||
      end.insideJumperPad === true ||
      (original.jumpers ?? []).some(
        (jumper) =>
          (sameRepairPoint(start, { ...jumper.start, z: start.z }) &&
            sameRepairPoint(end, { ...jumper.end, z: end.z })) ||
          (sameRepairPoint(start, { ...jumper.end, z: start.z }) &&
            sameRepairPoint(end, { ...jumper.start, z: end.z })),
      )
    if (!atomic) continue
    const segmentKey = repairValueKey([start, end])
    if (
      !repaired.route.some(
        (point, pointIndex) =>
          pointIndex + 1 < repaired.route.length &&
          repairValueKey([point, repaired.route[pointIndex + 1]]) ===
            segmentKey,
      )
    ) {
      throw new Error(
        "repair04 merge rejected a changed atomic jumper or through-obstacle span",
      )
    }
  }
  for (const point of repaired.route as RepairRoutePoint[]) {
    if (
      ![point.x, point.y, point.z].every(Number.isFinite) ||
      !Number.isInteger(point.z) ||
      point.z < 0 ||
      point.z >= layerCount ||
      !isPointInBounds(point, contextBounds)
    ) {
      throw new Error(
        "repair04 merge rejected invalid or out-of-region geometry",
      )
    }
    if (
      (point.pcb_port_id !== undefined ||
        point.insideJumperPad === true ||
        point.toNextSegmentCircuitJsonMetadata !== undefined) &&
      !original.route.some(
        (candidate) => repairValueKey(candidate) === repairValueKey(point),
      )
    ) {
      throw new Error(
        "repair04 merge rejected invented or moved terminal/circuit metadata",
      )
    }
    if (
      point.traceThickness !== undefined &&
      (!Number.isFinite(point.traceThickness) ||
        point.traceThickness <= 0 ||
        point.traceThickness >
          Math.max(
            original.traceThickness,
            ...(original.route as RepairRoutePoint[]).map(
              (candidate) => candidate.traceThickness ?? 0,
            ),
          ) +
            REGION_EPSILON)
    ) {
      throw new Error(
        "repair04 merge rejected increased per-point copper width",
      )
    }
  }
  for (let index = 1; index < repaired.route.length; index += 1) {
    const start = repaired.route[index - 1]!
    const end = repaired.route[index]!
    if (
      start.toNextSegmentType === "through_obstacle" &&
      !original.route.some(
        (point, pointIndex) =>
          pointIndex + 1 < original.route.length &&
          repairValueKey([point, original.route[pointIndex + 1]]) ===
            repairValueKey([start, end]),
      )
    ) {
      throw new Error(
        "repair04 merge rejected an invented through-obstacle span",
      )
    }
    if (start.z === end.z || start.toNextSegmentType === "through_obstacle")
      continue
    if (
      Math.abs(start.x - end.x) > REGION_EPSILON ||
      Math.abs(start.y - end.y) > REGION_EPSILON ||
      !repaired.vias.some(
        (via) =>
          Math.abs(via.x - start.x) <= REGION_EPSILON &&
          Math.abs(via.y - start.y) <= REGION_EPSILON,
      )
    ) {
      throw new Error("repair04 merge rejected a disconnected or missing via")
    }
  }
  for (const via of repaired.vias) {
    if (
      !Number.isFinite(via.x) ||
      !Number.isFinite(via.y) ||
      !isPointInBounds(via, contextBounds) ||
      !repaired.route.some(
        (point) =>
          Math.abs(point.x - via.x) <= REGION_EPSILON &&
          Math.abs(point.y - via.y) <= REGION_EPSILON,
      )
    ) {
      throw new Error("repair04 merge rejected an invalid via position")
    }
    if (
      !isPointInBounds(via, mutableBounds, REGION_EPSILON * 4) &&
      !original.vias.some(
        (candidate) => repairValueKey(candidate) === repairValueKey(via),
      )
    ) {
      throw new Error(
        "repair04 merge rejected a new via in the boundary collar",
      )
    }
  }
  for (const via of original.vias) {
    if (
      !isPointInBounds(via, mutableBounds, REGION_EPSILON * 4) &&
      !repaired.vias.some(
        (candidate) => repairValueKey(candidate) === repairValueKey(via),
      )
    ) {
      throw new Error(
        "repair04 merge rejected a changed via in the boundary collar",
      )
    }
  }
}

const appendRoutePoints = (
  target: RepairRoutePoint[],
  source: RepairRoutePoint[],
): void => {
  for (const point of source) {
    const previous = target[target.length - 1]
    // Do not collapse colocated points on different layers or drop provenance.
    if (
      previous &&
      sameRepairPoint(previous, point) &&
      repairValueKey(previous) === repairValueKey(point)
    )
      continue
    target.push(structuredClone(point))
  }
}

const removeRedundantCropPoints = (
  points: RepairRoutePoint[],
  source: HighDensityRoute,
  mappings: RepairRegionRouteMapping[],
): RepairRoutePoint[] => {
  const sourceKeys = new Set(source.route.map(repairValueKey))
  const cutKeys = new Set(
    mappings
      .flatMap((mapping) => mapping.originalFragment.route.map(repairValueKey))
      .filter((key) => !sourceKeys.has(key)),
  )
  const output: RepairRoutePoint[] = []
  for (const point of points) {
    output.push(point)
    while (output.length >= 3) {
      const start = output[output.length - 3]!
      const middle = output[output.length - 2]!
      const end = output[output.length - 1]!
      if (!cutKeys.has(repairValueKey(middle))) break
      if (
        start.z !== middle.z ||
        (middle.z !== end.z && start.toNextSegmentType !== "through_obstacle")
      )
        break
      if (
        start.toNextSegmentType !== middle.toNextSegmentType ||
        start.insideJumperPad !== middle.insideJumperPad ||
        start.traceThickness !== middle.traceThickness ||
        repairValueKey(start.toNextSegmentCircuitJsonMetadata) !==
          repairValueKey(middle.toNextSegmentCircuitJsonMetadata)
      )
        break
      const dx = end.x - start.x
      const dy = end.y - start.y
      const squaredLength = dx * dx + dy * dy
      if (squaredLength <= REGION_EPSILON * REGION_EPSILON) break
      const cross = (middle.x - start.x) * dy - (middle.y - start.y) * dx
      const t =
        ((middle.x - start.x) * dx + (middle.y - start.y) * dy) / squaredLength
      if (
        Math.abs(cross) > REGION_EPSILON * Math.sqrt(squaredLength) ||
        t < 0 ||
        t > 1
      )
        break
      output.splice(output.length - 2, 1)
    }
  }
  return output
}

const positionValue = (position: RepairRoutePosition): number => {
  if (
    !Number.isInteger(position.segmentIndex) ||
    position.segmentIndex < 0 ||
    !Number.isFinite(position.t) ||
    position.t < 0 ||
    position.t > 1
  ) {
    throw new Error("repair04 merge received invalid fragment provenance")
  }
  return position.segmentIndex + position.t
}

/** Validate the local contract before replacing only the mapped source spans. */
export const mergeRepairRegion = ({
  routes,
  region,
  repairedRoutes,
}: MergeRepairRegionOptions): HighDensityRoute[] => {
  if (
    repairedRoutes.length !== region.routeMappings.length ||
    region.lockedPointIndices.length !== repairedRoutes.length
  ) {
    throw new Error(
      "repair04 merge requires exactly one replacement for every extracted fragment",
    )
  }
  const changedBySource = new Map<
    number,
    Array<{ mapping: RepairRegionRouteMapping; repaired: HighDensityRoute }>
  >()
  for (let index = 0; index < repairedRoutes.length; index += 1) {
    const mapping = region.routeMappings[index]!
    const repaired = repairedRoutes[index]!
    const source = routes[mapping.sourceRouteIndex]
    if (!source) throw new Error("repair04 merge source route no longer exists")
    assertSafeFragment(
      mapping.originalFragment,
      repaired,
      region.lockedPointIndices[index]!,
      region.mutableBounds,
      region.contextBounds,
      region.srj.layerCount,
    )
    if (repairValueKey(mapping.originalFragment) === repairValueKey(repaired))
      continue
    const entries = changedBySource.get(mapping.sourceRouteIndex) ?? []
    entries.push({ mapping, repaired })
    changedBySource.set(mapping.sourceRouteIndex, entries)
  }
  return routes.map((source, sourceIndex) => {
    const changes = changedBySource.get(sourceIndex)
    if (!changes) return source
    changes.sort(
      (left, right) =>
        positionValue(left.mapping.start) - positionValue(right.mapping.start),
    )
    const mergedPoints: RepairRoutePoint[] = []
    let cursor = 0
    for (const { mapping, repaired } of changes) {
      const start = positionValue(mapping.start)
      const end = positionValue(mapping.end)
      if (
        start < cursor - REGION_EPSILON ||
        end < start ||
        end > source.route.length - 1 + REGION_EPSILON
      ) {
        throw new Error(
          "repair04 merge received overlapping or stale fragment provenance",
        )
      }
      if (
        getRepairSourceStateKey(source, start, end) !==
        mapping.sourceGeometryKey
      ) {
        throw new Error("repair04 merge rejected stale source geometry")
      }
      appendRoutePoints(
        mergedPoints,
        getRepairSourceSpan(source, cursor, start),
      )
      appendRoutePoints(mergedPoints, repaired.route)
      cursor = end
    }
    appendRoutePoints(
      mergedPoints,
      getRepairSourceSpan(source, cursor, source.route.length - 1),
    )
    const removedViaKeys = new Set(
      changes.flatMap(({ mapping }) =>
        mapping.originalFragment.vias.map((via) => `${via.x},${via.y}`),
      ),
    )
    const vias = source.vias
      .filter((via) => !removedViaKeys.has(`${via.x},${via.y}`))
      .map((via) => structuredClone(via))
    for (const { repaired } of changes) {
      for (const via of repaired.vias) {
        if (
          !vias.some(
            (existing) =>
              Math.abs(existing.x - via.x) <= REGION_EPSILON &&
              Math.abs(existing.y - via.y) <= REGION_EPSILON,
          )
        )
          vias.push(structuredClone(via))
      }
    }
    return {
      ...source,
      route: removeRedundantCropPoints(
        mergedPoints,
        source,
        changes.map(({ mapping }) => mapping),
      ),
      vias,
    }
  })
}
