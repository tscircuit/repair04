import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("extraction and negotiation retain departure metadata at coincident vertices", (): void => {
  for (const throughHole of [false, true]) {
    for (const pointMetadata of [
      {},
      { traceThickness: 0.2 },
      { pcb_port_id: "branch" },
    ]) {
      const atomic = {
        toNextSegmentType: "through_obstacle" as const,
        toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "hole" },
      }
      const route: HighDensityRoute = {
        connectionName: "signal",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { x: -5.25, y: 0, z: 0, pcb_port_id: "start" },
          { x: -4.75, y: 0, z: 0 },
          { x: -4.75, y: 0, z: 1 },
          {
            x: 4.75,
            y: 0,
            z: 1,
            ...pointMetadata,
            ...(!throughHole ? atomic : {}),
          },
          { x: 4.75, y: 0, z: 1, ...(throughHole ? atomic : {}) },
          { x: 4.75, y: 0, z: 2 },
          { x: 5.25, y: 0, z: 2, pcb_port_id: "end" },
        ],
        vias: [
          { x: -4.75, y: 0 },
          ...(!throughHole ? [{ x: 4.75, y: 0 }] : []),
        ],
      }
      const before = structuredClone(route)
      const srj: SimpleRouteJson = {
        layerCount: 4,
        minTraceWidth: 0.1,
        bounds: { minX: -6, maxX: 6, minY: -6, maxY: 6 },
        connections: [],
        obstacles: [],
      }
      const region = extractRepairRegion({
        srj,
        routes: [route],
        bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      })
      const repair = negotiateTraceClearance({
        srj: region.srj,
        routes: region.routes,
        bounds: region.mutableBounds,
        isLocked: (ri, pi): boolean => region.lockedPointIndices[ri]![pi]!,
        dirtyRouteIndices: [],
        allowLayerChanges: true,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: 0,
        maxPathSearchCalls: 0,
      })
      const merged = mergeRepairRegion({
        routes: [route],
        region,
        repairedRoutes: repair.routes,
      })
      expect(merged).toEqual([before])
      expect(route).toEqual(before)
    }
  }
})
