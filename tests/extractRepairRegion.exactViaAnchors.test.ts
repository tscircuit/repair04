import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("preserves exact via anchors beside distinct nearby planar vertices", () => {
  for (const offset of [0, 13.125]) {
    const input = regionSafetyFixture()
    const via = { x: offset, y: -offset }
    input.bounds = {
      minX: offset - 5,
      maxX: offset + 5,
      minY: -offset - 5,
      maxY: -offset + 5,
    }
    input.routes = [
      {
        ...input.routes[0]!,
        route: [
          { x: offset - 2, y: -offset, z: 0 },
          { x: offset - 3e-9, y: -offset + 3e-9, z: 0 },
          { ...via, z: 0 },
          { ...via, z: 1 },
          { x: offset + 3e-9, y: -offset - 3e-9, z: 1 },
          { x: offset + 2, y: -offset, z: 1 },
        ],
        vias: [via],
      },
    ]
    input.srj.obstacles = []
    const before = structuredClone(input.routes)
    const region = extractRepairRegion(input)
    expect(region.routes[0]!.route).toEqual(before[0]!.route)
    const repair = negotiateTraceClearance({
      srj: region.srj,
      routes: region.routes,
      bounds: region.mutableBounds,
      isLocked: (ri, pi) => region.lockedPointIndices[ri]![pi]!,
      dirtyRouteIndices: [0],
      allowLayerChanges: true,
      traceClearance: 0.1,
      viaClearance: 0.1,
      maxPathSearchNodes: 0,
      maxPathSearchCalls: 0,
    })
    const merged = mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: repair.routes,
    })
    expect(merged).toEqual(before)
    expect(input.routes).toEqual(before)
  }
})
