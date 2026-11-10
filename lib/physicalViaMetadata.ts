import type { HighDensityRoute as BaseHighDensityRoute } from "high-density-repair03/lib"

export type PhysicalHighDensityVia = BaseHighDensityRoute["vias"][number] & {
  outerDiameter?: number
  holeDiameter?: number
}
export type PhysicalHighDensityRoute = Omit<BaseHighDensityRoute, "vias"> & {
  vias: PhysicalHighDensityVia[]
}

type ViaDimensions = Pick<
  PhysicalHighDensityVia,
  "outerDiameter" | "holeDiameter"
>
type Point = { x: number; y: number }

/**
 * The one copper diameter of a via: the record's own value, or the route
 * default when the record declares none. Invalid dimensions are rejected here,
 * so every caller that reads a via for geometry sees the same value.
 */
export function getPhysicalViaDiameter(
  route: PhysicalHighDensityRoute,
  via: ViaDimensions,
): number {
  const diameter = via.outerDiameter ?? route.viaDiameter
  if (
    !Number.isFinite(diameter) ||
    diameter <= 0 ||
    (via.holeDiameter !== undefined &&
      (!Number.isFinite(via.holeDiameter) ||
        via.holeDiameter <= 0 ||
        via.holeDiameter > diameter))
  )
    throw new Error("repair04: invalid physical via dimensions")
  return diameter
}

/** Compare parsed copper and hole diameters, not raw field presence. */
function hasSameDimensions(
  route: PhysicalHighDensityRoute,
  first: ViaDimensions,
  second: ViaDimensions,
): boolean {
  return (
    (first.outerDiameter ?? route.viaDiameter) ===
      (second.outerDiameter ?? route.viaDiameter) &&
    first.holeDiameter === second.holeDiameter
  )
}

/** Exact original position lookup only; movement must carry transition identity. */
export function getPhysicalViaAt(
  route: PhysicalHighDensityRoute,
  position: Point,
): PhysicalHighDensityVia | undefined {
  const matches = route.vias.filter(
    (via) => via.x === position.x && via.y === position.y,
  )
  const first = matches[0]
  for (const via of matches) {
    getPhysicalViaDiameter(route, via)
    if (first && !hasSameDimensions(route, first, via))
      throw new Error("repair04: conflicting coincident physical via metadata")
  }
  return first === undefined ? undefined : structuredClone(first)
}

/**
 * Projection only changes positions. Each record follows the layer transition
 * at its original position; a record without a provable transition, changed
 * topology, or invalid dimensions keeps its position and metadata unchanged.
 */
export function preserveProjectedVias(
  next: PhysicalHighDensityRoute,
  source: PhysicalHighDensityRoute,
): PhysicalHighDensityVia[] {
  const topologyUnchanged =
    next.route.length === source.route.length &&
    next.route.every((point, index) => point.z === source.route[index]!.z)
  const sourceTransitionPositions = new Set<string>()
  for (let index = 1; index < source.route.length; index++) {
    const before = source.route[index - 1]!
    const point = source.route[index]!
    if (before.z === point.z || before.toNextSegmentType === "through_obstacle")
      continue
    if (before.x !== point.x || before.y !== point.y) continue
    sourceTransitionPositions.add(`${point.x},${point.y}`)
  }
  // A proven transition's destination, or null when several disagree.
  const destinations = new Map<string, Point | null>()
  if (topologyUnchanged) {
    for (let index = 1; index < next.route.length; index++) {
      const before = next.route[index - 1]!
      const point = next.route[index]!
      if (
        before.z === point.z ||
        before.toNextSegmentType === "through_obstacle"
      )
        continue
      if (before.x !== point.x || before.y !== point.y) continue
      const original = source.route[index - 1]!
      const key = `${original.x},${original.y}`
      const destination = { x: point.x, y: point.y }
      const previous = destinations.get(key)
      if (previous === undefined) destinations.set(key, destination)
      // Ambiguity is sticky: a later transition must not resolve it again.
      else if (
        previous === null ||
        previous.x !== destination.x ||
        previous.y !== destination.y
      )
        destinations.set(key, null)
    }
  }
  // Positions where `next` still has a layer transition after a topology edit.
  const nextTransitionPositions = new Set<string>()
  for (let index = 1; index < next.route.length; index++) {
    const before = next.route[index - 1]!
    const point = next.route[index]!
    if (before.z === point.z || before.toNextSegmentType === "through_obstacle")
      continue
    if (before.x !== point.x || before.y !== point.y) continue
    nextTransitionPositions.add(`${point.x},${point.y}`)
  }
  const records = new Map<string, PhysicalHighDensityVia>()
  for (const via of source.vias) {
    const positionKey = `${via.x},${via.y}`
    const destination = destinations.get(positionKey)
    const hadTransition = sourceTransitionPositions.has(positionKey)
    // A transition that existed and is now gone removes its via. A record that
    // never had a local transition is a fixed boundary via and stays put.
    if (topologyUnchanged) {
      if (hadTransition && destination === undefined) continue
    } else if (hadTransition && !nextTransitionPositions.has(positionKey)) {
      continue
    }
    const target = destination ?? ({ x: via.x, y: via.y } satisfies Point)
    const record = { ...via, x: target.x, y: target.y }
    const recordKey = [
      record.x,
      record.y,
      record.outerDiameter ?? source.viaDiameter,
      record.holeDiameter ?? "",
    ].join(":")
    if (!records.has(recordKey)) records.set(recordKey, record)
  }
  return [...records.values()]
}

/**
 * Preserve projected records and declare a position-only record for every
 * legal layer transition that has no record. Physical dimensions stay unknown
 * unless the source supplied them.
 */
export function withDeclaredVias(
  next: PhysicalHighDensityRoute,
  source: PhysicalHighDensityRoute,
): PhysicalHighDensityVia[] {
  const vias = preserveProjectedVias(next, source)
  for (let index = 1; index < next.route.length; index++) {
    const before = next.route[index - 1]!
    const point = next.route[index]!
    if (
      before.z === point.z ||
      before.toNextSegmentType === "through_obstacle" ||
      before.x !== point.x ||
      before.y !== point.y
    )
      continue
    if (!vias.some((via) => via.x === point.x && via.y === point.y))
      vias.push({ x: point.x, y: point.y })
  }
  return vias
}
