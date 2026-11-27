import Flatbush from "flatbush"
import type { SimplifiedPcbTrace } from "high-density-repair03/lib"
import type { RepairRoutePoint } from "./repairRegionTypes"
import { getRepairCopperLayerSpan } from "./getRepairCopperLayerSpan"
import type { ClearancePathInput } from "./findClearancePath"
import { REGION_EPSILON } from "./repairRegionGeometry"

type Drill = {
  x: number
  y: number
  minZ: number
  maxZ: number
  holeDiameter: number
  padDiameter: number
}

/** Same-net tracks may share copper. Distinct manufactured drill holes need clearance. */
export class SameNetDrillIndex {
  private readonly drills: Drill[] = []
  private index?: Flatbush
  constructor(
    private readonly options: {
      board: ClearancePathInput["srj"]
      newHoleDiameter: number
      newPadDiameter: number
      edgeClearance: number
    },
  ) {}

  addTrace(
    trace: SimplifiedPcbTrace,
    layerToZ: (layer: string) => number,
  ): void {
    this.index = undefined
    for (const point of trace.route) {
      if (point.route_type !== "via") continue
      this.drills.push({
        x: point.x,
        y: point.y,
        ...getRepairCopperLayerSpan(
          this.options.board,
          { z: layerToZ(point.from_layer) },
          { z: layerToZ(point.to_layer) },
        ),
        padDiameter: point.via_diameter ?? this.options.newPadDiameter,
        holeDiameter:
          ("via_hole_diameter" in point &&
          typeof point.via_hole_diameter === "number"
            ? point.via_hole_diameter
            : undefined) ??
          this.options.board.minViaHoleDiameter ??
          this.options.newHoleDiameter,
      })
    }
  }

  canPlaceVia(from: RepairRoutePoint, to: RepairRoutePoint): boolean {
    if (!this.drills.length) return true
    const { board, newHoleDiameter, newPadDiameter, edgeClearance } =
      this.options
    if (!this.index) {
      this.index = new Flatbush(this.drills.length)
      for (const drill of this.drills) {
        const reach = (newHoleDiameter + drill.holeDiameter) / 2 + edgeClearance
        this.index.add(
          drill.x - reach,
          drill.y - reach,
          drill.x + reach,
          drill.y + reach,
        )
      }
      this.index.finish()
    }
    const { minZ, maxZ } = getRepairCopperLayerSpan(board, from, to)
    return this.index.search(from.x, from.y, from.x, from.y).every((index) => {
      const drill = this.drills[index]!
      if (maxZ < drill.minZ || minZ > drill.maxZ) return true
      if (
        from.x === drill.x &&
        from.y === drill.y &&
        newHoleDiameter === drill.holeDiameter &&
        newPadDiameter === drill.padDiameter &&
        minZ === drill.minZ &&
        maxZ === drill.maxZ
      )
        return true
      return (
        Math.hypot(from.x - drill.x, from.y - drill.y) + REGION_EPSILON >=
        (newHoleDiameter + drill.holeDiameter) / 2 + edgeClearance
      )
    })
  }
}
