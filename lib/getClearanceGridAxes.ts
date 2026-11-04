import type { SimpleRouteJson } from "high-density-repair03/lib"
import type { Bounds } from "./repairRegionTypes"

type ClearanceGridAxes = {
  xs: number[]
  ys: number[]
  nearestIndex: (axis: number[], coordinate: number) => number
}

/** Retain regular search coverage and represent exact channels between round pads. */
export function getClearanceGridAxes(
  srj: SimpleRouteJson,
  bounds: Bounds,
  gridSize: number,
): ClearanceGridAxes {
  const xs = Array.from(
    { length: Math.floor((bounds.maxX - bounds.minX) / gridSize) },
    (_, index): number => bounds.minX + (index + 0.5) * gridSize,
  )
  const ys = Array.from(
    { length: Math.floor((bounds.maxY - bounds.minY) / gridSize) },
    (_, index): number => bounds.minY + (index + 0.5) * gridSize,
  )
  const padXs = new Set<number>()
  const padYs = new Set<number>()
  for (const obstacle of srj.obstacles) {
    if (obstacle.shape !== "circle") continue
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
  const includePadChannels = (
    axis: number[],
    coordinates: Set<number>,
    minimum: number,
    maximum: number,
  ): number[] => {
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
  const nearestIndex = (axis: number[], coordinate: number): number => {
    let low = 0
    let high = axis.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (axis[middle]! < coordinate) low = middle + 1
      else high = middle
    }
    return low > 0 && coordinate - axis[low - 1]! < axis[low]! - coordinate
      ? low - 1
      : low
  }
  return {
    xs: includePadChannels(xs, padXs, bounds.minX, bounds.maxX),
    ys: includePadChannels(ys, padYs, bounds.minY, bounds.maxY),
    nearestIndex,
  }
}
