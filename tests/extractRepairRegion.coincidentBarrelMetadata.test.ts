import { expect, test } from "bun:test"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { getRepairRouteVias } from "../lib/getRepairRouteVias"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("keeps a coincident vertex's outgoing barrel and width metadata through extraction and merge", (): void => {
  const input = regionSafetyFixture()
  const route = input.routes[0]!
  const points: RepairRoutePoint[] = [
    { x: -100, y: 0, z: 0, pcb_port_id: "start" },
    { x: 4.5, y: 0, z: 0, traceThickness: 0.1 },
    {
      x: 4.5,
      y: 0,
      z: 0,
      traceThickness: 0.2,
      toNextSegmentType: "through_obstacle",
    },
    { x: 4.5, y: 0, z: 1, traceThickness: 0.2 },
    { x: 100, y: 0, z: 1, pcb_port_id: "end" },
  ]
  route.route = points
  input.srj.connections[0]!.pointsToConnect = [
    { x: -100, y: 0, layer: "top", pcb_port_id: "start" },
    { x: 100, y: 0, layer: "bottom", pcb_port_id: "end" },
  ]
  const region = extractRepairRegion({ ...input, boundaryMargin: 1 })
  const outgoing = region.routes[0]!.route.find(
    (point) => point.toNextSegmentType === "through_obstacle",
  )
  expect(outgoing).toMatchObject({ x: 4.5, y: 0, z: 0, traceThickness: 0.2 })
  const repairedRoutes = region.routes.map((fragment) => ({
    ...fragment,
    vias: getRepairRouteVias({
      route: fragment,
      mutableBounds: region.mutableBounds,
    }),
  }))
  expect(repairedRoutes[0]!.vias).toEqual([])
  expect(
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
  ).toEqual(input.routes)
  const newDrill = structuredClone(repairedRoutes)
  newDrill[0]!.vias.push({ x: 4.5, y: 0 })
  expect(() =>
    mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: newDrill,
    }),
  ).toThrow("boundary collar")
})
