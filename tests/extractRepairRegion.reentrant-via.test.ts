import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("a reentrant via belongs only to the fragment carrying its layer transition", (): void => {
  for (const offset of [0, 13.125]) {
    const via = { x: offset + 5.25, y: 0 }
    const route: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: offset, y: -1, z: 0, pcb_port_id: "start" },
        { ...via, z: 0 },
        { x: offset + 6, y: 1, z: 0 },
        { ...via, z: 0 },
        { ...via, z: 1 },
        { x: offset, y: -2, z: 1, pcb_port_id: "end" },
      ],
      vias: [via],
    }
    const before = structuredClone(route)
    const srj: SimpleRouteJson = {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds: { minX: offset - 10, maxX: offset + 10, minY: -10, maxY: 10 },
      connections: [],
      obstacles: [],
    }
    const region = extractRepairRegion({
      srj,
      routes: [route],
      bounds: { minX: offset - 5, maxX: offset + 5, minY: -5, maxY: 5 },
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
    expect(region.routes).toHaveLength(2)
    expect(region.routes[0]!.vias).toEqual([])
    expect(region.routes[1]!.vias).toEqual([via])
    expect(merged).toEqual([before])
    expect(merged[0]!.vias).toEqual([via])
    expect(route).toEqual(before)

    const attachmentIndex = region.routes[0]!.route.findIndex(
      (point): boolean => point.x === via.x && point.y === via.y,
    )
    expect(region.lockedPointIndices[0]![attachmentIndex]).toBe(true)
    const detour = structuredClone(repair.routes)
    detour[0]!.route.splice(1, 0, { x: offset + 2, y: -1, z: 0 })
    const edited = mergeRepairRegion({
      routes: [route],
      region,
      repairedRoutes: detour,
    })[0]!
    expect(edited.vias).toEqual([via])
    const transition = edited.route.findIndex(
      (point, index, points): boolean =>
        point.z !== points[index + 1]?.z &&
        point.x === via.x &&
        point.y === via.y,
    )
    expect(transition).toBeGreaterThanOrEqual(0)
    expect(edited.route[transition + 1]).toEqual({ ...via, z: 1 })
    expect(edited.route[0]).toEqual(before.route[0])
    expect(edited.route.at(-1)).toEqual(before.route.at(-1))
  }
})
