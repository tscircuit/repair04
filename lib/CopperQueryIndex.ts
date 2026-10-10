import Flatbush from "flatbush"
import type { Bounds } from "./repairRegionTypes"
import { REGION_EPSILON } from "./repairRegionGeometry"

type CopperBounds = Bounds & { radius: number }
type QueryWindow = Bounds & { candidates: number[] }

/**
 * Reuses enclosing searches while retaining the exact candidate set.
 * Raw Flatbush traversal order may differ: callers must restore their existing
 * total hit order before accumulating costs or otherwise observing hit order.
 */
export class CopperQueryIndex<Copper extends CopperBounds> {
  readonly index: Flatbush
  private readonly indexedBounds: Float64Array
  private readonly canReuseWindows: boolean
  private window?: QueryWindow

  constructor(readonly copper: Copper[]) {
    this.index = new Flatbush(copper.length)
    this.indexedBounds = new Float64Array(copper.length * 4)
    let canReuseWindows = true
    for (let i = 0; i < copper.length; i++) {
      const item = copper[i]!
      const minX = item.minX - item.radius - REGION_EPSILON
      const minY = item.minY - item.radius - REGION_EPSILON
      const maxX = item.maxX + item.radius + REGION_EPSILON
      const maxY = item.maxY + item.radius + REGION_EPSILON
      this.index.add(minX, minY, maxX, maxY)
      const offset = i * 4
      this.indexedBounds[offset] = minX
      this.indexedBounds[offset + 1] = minY
      this.indexedBounds[offset + 2] = maxX
      this.indexedBounds[offset + 3] = maxY
      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY) ||
        minX > maxX ||
        minY > maxY
      )
        canReuseWindows = false
    }
    this.index.finish()
    this.canReuseWindows = canReuseWindows
  }

  search(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    windowPadding: number,
  ): number[] {
    // Keep the original query for long edges and unusual accepted bounds. A
    // finite ordered rectangle is required for the enclosing-window proof.
    if (
      !this.canReuseWindows ||
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      !Number.isFinite(windowPadding) ||
      windowPadding <= 0 ||
      minX > maxX ||
      minY > maxY
    )
      return this.index.search(minX, minY, maxX, maxY)

    let window = this.window
    if (
      !window ||
      minX < window.minX ||
      minY < window.minY ||
      maxX > window.maxX ||
      maxY > window.maxY
    ) {
      const windowMinX = minX - windowPadding
      const windowMinY = minY - windowPadding
      const windowMaxX = maxX + windowPadding
      const windowMaxY = maxY + windowPadding
      if (
        !Number.isFinite(windowMinX) ||
        !Number.isFinite(windowMinY) ||
        !Number.isFinite(windowMaxX) ||
        !Number.isFinite(windowMaxY)
      )
        return this.index.search(minX, minY, maxX, maxY)
      window = {
        minX: windowMinX,
        minY: windowMinY,
        maxX: windowMaxX,
        maxY: windowMaxY,
        candidates: this.index.search(
          windowMinX,
          windowMinY,
          windowMaxX,
          windowMaxY,
        ),
      }
      this.window = window
    }

    const candidates: number[] = []
    const bounds = this.indexedBounds
    for (const candidate of window.candidates) {
      const offset = candidate * 4
      // These are the exact Float64 bounds supplied to index.add, tested with
      // Flatbush's strict rejection comparisons, including touching equality.
      if (
        maxX < bounds[offset]! ||
        maxY < bounds[offset + 1]! ||
        minX > bounds[offset + 2]! ||
        minY > bounds[offset + 3]!
      )
        continue
      candidates.push(candidate)
    }
    // A containing Flatbush query can traverse leaves differently. Callers
    // restore their existing total hit order before any owner accumulation.
    return candidates
  }
}
