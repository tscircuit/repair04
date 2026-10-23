import Flatbush from "flatbush"
import type { ClearancePathConnectivity } from "./ClearancePathConnectivity"
import { getSegmentToSegmentMinDistance as segmentToSegmentMinDistance } from "./getSegmentToSegmentMinDistance"
import { FindClearancePathSolver } from "./FindClearancePathSolver"
import type { ClearancePathInput } from "./findClearancePath"
import { getRepairCopperLayerSpan } from "./getRepairCopperLayerSpan"
import { REGION_EPSILON } from "./repairRegionGeometry"
import type { RepairRoutePoint } from "./repairRegionTypes"

export type NegotiatedClearanceCopper = {
  a: RepairRoutePoint
  b: RepairRoutePoint
  radius: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  spanIndex: number
  owner: string
  index: number
  cellX: number
  cellY: number
  immutable: boolean
}

type Copper = NegotiatedClearanceCopper
type CopperIndex = {
  index: Flatbush
  copper: Copper[]
  cellCandidates: Map<number, Map<number, number[]>>
  queryStamps: Uint32Array
}
export type NegotiatedClearanceSearchInput = {
  pathInput: Omit<ClearancePathInput, "stats" | "getAdditionalEdgeCost">
  coppers: NegotiatedClearanceCopper[]
  selectedOwner: string
  weights: number[]
}
export function createNegotiatedClearanceSearchKernel(
  task: NegotiatedClearanceSearchInput,
): {
  getAdditionalEdgeCost: (a: RepairRoutePoint, b: RepairRoutePoint) => number
  query: (
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ) => Array<{ copper: Copper; ratio: number }>
} {
  const { pathInput: input, coppers, selectedOwner, weights } = task
  const route = input.routes[input.routeIndex]!
  const createCopperIndex = (
    indexedCopper: Copper[],
  ): CopperIndex | undefined => {
    if (!indexedCopper.length) return undefined
    const index = new Flatbush(indexedCopper.length)
    for (const copper of indexedCopper) {
      index.add(
        copper.minX - copper.radius - REGION_EPSILON,
        copper.minY - copper.radius - REGION_EPSILON,
        copper.maxX + copper.radius + REGION_EPSILON,
        copper.maxY + copper.radius + REGION_EPSILON,
      )
    }
    index.finish()
    return {
      index,
      copper: indexedCopper,
      cellCandidates: new Map(),
      queryStamps: new Uint32Array(indexedCopper.length),
    }
  }
  const copperIndex = createCopperIndex(coppers)
  const copperByLayer = new Map<number, CopperIndex | undefined>()
  for (let z = 0; z < input.srj.layerCount; z++) {
    copperByLayer.set(
      z,
      createCopperIndex(
        coppers.filter(
          (copper): boolean => copper.minZ <= z && copper.maxZ >= z,
        ),
      ),
    )
  }
  const candidateScratch: number[] = []
  let queryId = 0
  const query = (
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ): Array<{ copper: Copper; ratio: number }> => {
    const via = a.z !== b.z
    const minX = Math.min(a.x, b.x),
      maxX = Math.max(a.x, b.x),
      minY = Math.min(a.y, b.y),
      maxY = Math.max(a.y, b.y)
    const reach =
      (via ? route.viaDiameter : route.traceThickness) / 2 +
      Math.max(input.traceClearance, input.viaClearance)
    const hits: Array<{ copper: Copper; ratio: number }> = []
    const span = getRepairCopperLayerSpan(input.srj, a, b)
    const activeIndex = via ? copperIndex : copperByLayer.get(a.z)
    const queryMinX = minX - reach - REGION_EPSILON
    const queryMinY = minY - reach - REGION_EPSILON
    const queryMaxX = maxX + reach + REGION_EPSILON
    const queryMaxY = maxY + reach + REGION_EPSILON
    const firstX = Math.floor(queryMinX),
      lastX = Math.floor(queryMaxX)
    const firstY = Math.floor(queryMinY),
      lastY = Math.floor(queryMaxY)
    if (queryId === 0xffffffff) {
      copperIndex?.queryStamps.fill(0)
      for (const index of copperByLayer.values()) index?.queryStamps.fill(0)
      queryId = 0
    }
    const currentQuery = ++queryId
    let candidates: number[]
    if (
      activeIndex &&
      (lastX - firstX + 1) * (lastY - firstY + 1) <= 16 &&
      Number.isSafeInteger(firstX) &&
      Number.isSafeInteger(lastX) &&
      Number.isSafeInteger(firstY) &&
      Number.isSafeInteger(lastY)
    ) {
      // Adjacent A* edges repeatedly visit the same small spatial cells.
      // Cache their broad-phase candidates, then apply the original
      // exact query bounds below. Long simplification edges query the
      // tree directly rather than walking a large rectangle of cells.
      candidateScratch.length = 0
      for (let x = firstX; x <= lastX; x++) {
        let column = activeIndex.cellCandidates.get(x)
        if (!column) {
          column = new Map()
          activeIndex.cellCandidates.set(x, column)
        }
        for (let y = firstY; y <= lastY; y++) {
          let bucket = column.get(y)
          if (!bucket) {
            bucket = activeIndex.index.search(x, y, x + 1, y + 1)
            column.set(y, bucket)
          }
          for (const candidate of bucket) {
            const copper = activeIndex.copper[candidate]!
            if (activeIndex.queryStamps[candidate] === currentQuery) continue
            activeIndex.queryStamps[candidate] = currentQuery
            if (
              queryMaxX < copper.minX - copper.radius - REGION_EPSILON ||
              queryMaxY < copper.minY - copper.radius - REGION_EPSILON ||
              queryMinX > copper.maxX + copper.radius + REGION_EPSILON ||
              queryMinY > copper.maxY + copper.radius + REGION_EPSILON
            )
              continue
            candidateScratch.push(candidate)
          }
        }
      }
      candidates = candidateScratch
    } else {
      candidates =
        activeIndex?.index.search(queryMinX, queryMinY, queryMaxX, queryMaxY) ??
        []
    }
    for (const candidate of candidates) {
      const copper = activeIndex!.copper[candidate]!
      const bothVias = via && copper.minZ !== copper.maxZ
      const sharedLayers = copper.minZ <= span.maxZ && copper.maxZ >= span.minZ
      if (!sharedLayers && !bothVias) continue
      if (copper.immutable && !bothVias) continue
      if (
        copper.owner === selectedOwner &&
        (!bothVias || (a.x === copper.a.x && a.y === copper.a.y))
      )
        continue
      const copperDistance =
        (via ? route.viaDiameter : route.traceThickness) / 2 +
        (bothVias ? input.viaClearance : input.traceClearance) +
        copper.radius
      const drillDistance =
        (input.viaHoleDiameter ?? route.viaDiameter) / 2 +
        (input.viaHoleDiameter ?? copper.radius * 2) / 2 +
        input.viaClearance
      // Drill spacing applies even when the connected copper spans do
      // not share layers. Same-net copper may overlap, distinct holes may not.
      const required = bothVias
        ? sharedLayers && copper.owner !== selectedOwner
          ? Math.max(copperDistance, drillDistance)
          : drillDistance
        : copperDistance
      // A cell may contain many distant segments. Their axis-aligned
      // separation is a lower bound on the exact distance; preserve the
      // existing narrow-phase calculation at and near the boundary.
      if (
        minX - required - REGION_EPSILON > copper.maxX ||
        maxX + required + REGION_EPSILON < copper.minX ||
        minY - required - REGION_EPSILON > copper.maxY ||
        maxY + required + REGION_EPSILON < copper.minY
      )
        continue
      const distance = segmentToSegmentMinDistance(a, b, copper.a, copper.b)
      if (distance < required - REGION_EPSILON)
        hits.push({
          copper,
          ratio: (required - distance) / (required * required),
        })
    }
    // Match the old integer-cell traversal order. This preserves floating
    // point accumulation and the order in which displaced spans are queued.
    const firstCellX = Math.floor(minX - reach)
    const firstCellY = Math.floor(minY - reach)
    hits.sort((left, right): number => {
      const x =
        Math.max(firstCellX, left.copper.cellX) -
        Math.max(firstCellX, right.copper.cellX)
      if (x !== 0) return x
      const y =
        Math.max(firstCellY, left.copper.cellY) -
        Math.max(firstCellY, right.copper.cellY)
      return y || left.copper.index - right.copper.index
    })
    return hits
  }
  const calculateAdditionalEdgeCost = (
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ): number => {
    const x = (a.x + b.x) / 2
    const y = (a.y + b.y) / 2
    if (
      x <= input.bounds.minX + REGION_EPSILON * 4 ||
      x >= input.bounds.maxX - REGION_EPSILON * 4 ||
      y <= input.bounds.minY + REGION_EPSILON * 4 ||
      y >= input.bounds.maxY - REGION_EPSILON * 4
    )
      return Infinity
    const costs = new Map<string, number>()
    for (const { copper, ratio } of query(a, b)) {
      if (copper.owner === selectedOwner || copper.immutable) return Infinity
      costs.set(
        copper.owner,
        Math.max(
          costs.get(copper.owner) ?? 0,
          ratio * weights[copper.spanIndex]!,
        ),
      )
    }
    let total = 0
    for (const cost of costs.values()) total += cost
    return (a.z === b.z ? Math.hypot(a.x - b.x, a.y - b.y) : 1) * total
  }
  // Ordinary drill sites occupy the full stack regardless of which two
  // electrical layers the search connects. Copper and weights are fixed
  // during this search, so reuse their congestion cost across transitions.
  const viaCosts = new Map<number, Map<number, number>>()
  const getAdditionalEdgeCost = (
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ): number => {
    if (
      a.z === b.z ||
      input.srj.allowBlindAndBuriedVias === true ||
      a.x !== b.x ||
      a.y !== b.y
    ) {
      return calculateAdditionalEdgeCost(a, b)
    }
    let column = viaCosts.get(a.x)
    const cached = column?.get(a.y)
    if (cached !== undefined) return cached
    const cost = calculateAdditionalEdgeCost(a, b)
    if (!column) {
      column = new Map<number, number>()
      viaCosts.set(a.x, column)
    }
    column.set(a.y, cost)
    return cost
  }
  return { getAdditionalEdgeCost, query }
}

function createPathInput(
  task: NegotiatedClearanceSearchInput,
): ClearancePathInput {
  let kernel:
    | ReturnType<typeof createNegotiatedClearanceSearchKernel>
    | undefined
  return {
    ...task.pathInput,
    stats: { nodesPopped: 0, completionReason: "no-path" },
    getAdditionalEdgeCost: (a, b): number => {
      kernel ??= createNegotiatedClearanceSearchKernel(task)
      return kernel.getAdditionalEdgeCost(a, b)
    },
  }
}

/** Each directional lane owns an ordinary Find and its pure cost kernel. */
export function createNegotiatedClearanceSearch(
  input: NegotiatedClearanceSearchInput,
  connectivity?: ClearancePathConnectivity,
): FindClearancePathSolver {
  return new FindClearancePathSolver(createPathInput(input), connectivity)
}
