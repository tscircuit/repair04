import type { SimpleRouteJson } from "high-density-repair03/lib"
import type { Bounds } from "./repairRegionTypes"

type PcbComponentId = string
type Obstacle = SimpleRouteJson["obstacles"][number] & { componentId?: string }

type ClearanceGridAxes = {
  hasPadChannels: boolean
  xs: number[]
  ys: number[]
  nearestIndex: (axis: number[], coordinate: number) => number
}

type PadChannelAxis = {
  axis: number[]
  coordinates: ReadonlySet<number>
  minimum: number
  maximum: number
}

function includePadChannels({
  axis,
  coordinates,
  minimum,
  maximum,
}: PadChannelAxis): number[] {
  const sorted = [...coordinates].sort((a, b): number => a - b)
  for (let index = 0; index < sorted.length; index++) {
    axis.push(sorted[index]!)
    if (index > 0) axis.push((sorted[index - 1]! + sorted[index]!) / 2)
  }
  return [...new Set(axis)]
    .filter(
      (coordinate): boolean => coordinate >= minimum && coordinate <= maximum,
    )
    .sort((a, b): number => a - b)
}

function nearestIndex(axis: number[], coordinate: number): number {
  let low = 0
  let high = axis.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (axis[middle]! < coordinate) low = middle + 1
    else high = middle
  }
  if (low > 0 && coordinate - axis[low - 1]! < axis[low]! - coordinate) {
    return low - 1
  }
  return low
}

/** Array channels belong to one component with separated pad rows and columns. */
function hasCircularPadArray(obstacles: readonly Obstacle[]): boolean {
  const padsByComponent = new Map<PcbComponentId, Obstacle[]>()
  for (const obstacle of obstacles) {
    if (
      obstacle.shape !== "circle" ||
      obstacle.isNonPlatedHole ||
      obstacle.isCopperPour ||
      obstacle.layers.length !== 1 ||
      obstacle.componentId === undefined
    )
      continue
    let pads = padsByComponent.get(obstacle.componentId)
    if (!pads) {
      pads = []
      padsByComponent.set(obstacle.componentId, pads)
    }
    pads.push(obstacle)
  }
  for (const pads of padsByComponent.values()) {
    const xs = [
      ...new Set(
        pads.map((pad): number => Math.round(pad.center.x * 1e7) / 1e7),
      ),
    ].sort((a, b): number => a - b)
    const ys = [
      ...new Set(
        pads.map((pad): number => Math.round(pad.center.y * 1e7) / 1e7),
      ),
    ].sort((a, b): number => a - b)
    if (xs.length < 2 || ys.length < 2) continue
    const diameter = Math.max(...pads.map((pad): number => pad.width))
    const separatedColumns = xs
      .slice(1)
      .every((x, index): boolean => x - xs[index]! >= diameter - 1e-7)
    const separatedRows = ys
      .slice(1)
      .every((y, index): boolean => y - ys[index]! >= diameter - 1e-7)
    if (separatedColumns && separatedRows) return true
  }
  return false
}

/** Include circular pad centers and gap centerlines in the clearance grid. */
export function getClearanceGridAxes({
  srj,
  bounds,
  gridSize,
}: {
  srj: SimpleRouteJson
  bounds: Bounds
  gridSize: number
}): ClearanceGridAxes {
  const xs = Array.from(
    { length: Math.floor((bounds.maxX - bounds.minX) / gridSize) },
    (_, index): number => bounds.minX + (index + 0.5) * gridSize,
  )
  const ys = Array.from(
    { length: Math.floor((bounds.maxY - bounds.minY) / gridSize) },
    (_, index): number => bounds.minY + (index + 0.5) * gridSize,
  )
  if (!hasCircularPadArray(srj.obstacles)) {
    return { xs, ys, nearestIndex, hasPadChannels: false }
  }
  const padXs = new Set<number>()
  const padYs = new Set<number>()
  for (const obstacle of srj.obstacles) {
    if (
      obstacle.shape !== "circle" ||
      obstacle.isNonPlatedHole ||
      obstacle.isCopperPour
    )
      continue
    const { x, y } = obstacle.center
    if (
      x + obstacle.width / 2 < bounds.minX ||
      x - obstacle.width / 2 > bounds.maxX ||
      y + obstacle.height / 2 < bounds.minY ||
      y - obstacle.height / 2 > bounds.maxY
    )
      continue
    padXs.add(Math.round(x * 1e7) / 1e7)
    padYs.add(Math.round(y * 1e7) / 1e7)
  }
  return {
    hasPadChannels: true,
    xs: includePadChannels({
      axis: xs,
      coordinates: padXs,
      minimum: bounds.minX,
      maximum: bounds.maxX,
    }),
    ys: includePadChannels({
      axis: ys,
      coordinates: padYs,
      minimum: bounds.minY,
      maximum: bounds.maxY,
    }),
    nearestIndex,
  }
}
