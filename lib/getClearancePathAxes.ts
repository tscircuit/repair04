import type { SimpleRouteJson } from "high-density-repair03/lib"
import type { Bounds } from "./repairRegionTypes"
import { REGION_EPSILON } from "./repairRegionGeometry"

type Obstacle = SimpleRouteJson["obstacles"][number] & {
  componentId?: string
}

export type ClearancePathAxis = {
  coordinates: number[]
  uniformToAxis: number[]
  axisToUniform: number[]
}

export type ClearancePathAxes = {
  x: ClearancePathAxis
  y: ClearancePathAxis
}

function getCircularPadGapCoordinates(
  obstacles: readonly Obstacle[],
  axis: "x" | "y",
): number[] {
  const perpendicular = axis === "x" ? "y" : "x"
  const components = new Map<string | undefined, Obstacle[]>()
  for (const obstacle of obstacles) {
    if (obstacle.shape !== "circle") continue
    const component = components.get(obstacle.componentId) ?? []
    component.push(obstacle)
    components.set(obstacle.componentId, component)
  }
  const coordinates: number[] = []
  for (const component of components.values()) {
    component.sort((a, b) => a.center[perpendicular] - b.center[perpendicular])
    let lineStart = 0
    while (lineStart < component.length) {
      let lineEnd = lineStart + 1
      while (
        lineEnd < component.length &&
        Math.abs(
          component[lineEnd]!.center[perpendicular] -
            component[lineStart]!.center[perpendicular],
        ) <= REGION_EPSILON
      )
        lineEnd++
      const line = component
        .slice(lineStart, lineEnd)
        .sort((a, b) => a.center[axis] - b.center[axis])
      for (let index = 1; index < line.length; index++) {
        const before = line[index - 1]!.center[axis]
        const after = line[index]!.center[axis]
        if (after - before > REGION_EPSILON)
          coordinates.push((before + after) / 2)
      }
      lineStart = lineEnd
    }
  }
  return coordinates
}

function createAxis(
  min: number,
  max: number,
  grid: number,
  candidates: readonly number[],
): ClearancePathAxis {
  const count = Math.floor((max - min) / grid)
  const uniform = Array.from(
    { length: count },
    (_, index) => min + (index + 0.5) * grid,
  )
  const added: number[] = []
  for (const value of [...candidates].sort((a, b) => a - b)) {
    if (value <= min || value >= max || !Number.isFinite(value)) continue
    const uniformIndex = Math.max(
      0,
      Math.min(count - 1, Math.floor((value - min) / grid)),
    )
    if (
      (count > 0 && Math.abs(value - uniform[uniformIndex]!) <= REGION_EPSILON) ||
      (added.length > 0 &&
        Math.abs(value - added[added.length - 1]!) <= REGION_EPSILON)
    )
      continue
    added.push(value)
  }
  const coordinates = [...uniform, ...added].sort((a, b) => a - b)
  const indexByCoordinate = new Map(
    coordinates.map((coordinate, index) => [coordinate, index]),
  )
  const uniformToAxis = uniform.map((value) => indexByCoordinate.get(value)!)
  const axisToUniform = new Array<number>(coordinates.length).fill(-1)
  for (let index = 0; index < uniformToAxis.length; index++)
    axisToUniform[uniformToAxis[index]!] = index
  return { coordinates, uniformToAxis, axisToUniform }
}

/** Retains the uniform lattice and adds physical circular-pad gap centerlines. */
export function getClearancePathAxes(
  obstacles: readonly Obstacle[],
  bounds: Bounds,
  grid: number,
): ClearancePathAxes | undefined {
  if (!obstacles.some((obstacle) => obstacle.shape === "circle")) return undefined
  const x = createAxis(
    bounds.minX,
    bounds.maxX,
    grid,
    getCircularPadGapCoordinates(obstacles, "x"),
  )
  const y = createAxis(
    bounds.minY,
    bounds.maxY,
    grid,
    getCircularPadGapCoordinates(obstacles, "y"),
  )
  if (
    x.coordinates.length === x.uniformToAxis.length &&
    y.coordinates.length === y.uniformToAxis.length
  )
    return undefined
  return { x, y }
}

export function getNearestClearancePathAxisIndex(
  coordinates: readonly number[],
  value: number,
): number {
  let low = 0
  let high = coordinates.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (coordinates[middle]! < value) low = middle + 1
    else high = middle
  }
  if (low === 0) return 0
  if (low === coordinates.length) return low - 1
  return value - coordinates[low - 1]! < coordinates[low]! - value
    ? low - 1
    : low
}
