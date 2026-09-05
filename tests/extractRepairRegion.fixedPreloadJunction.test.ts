import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("retains bounded fixed preload copper and preserves its endpoint and via branch attachments", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "via-branch",
    rootConnectionName: "signal-net",
    route: [
      { x: -2, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
    ],
    vias: [{ x: 0, y: 1 }],
  }
  input.srj.connections.push({
    name: "fixed-branch",
    rootConnectionName: "signal-net",
    pointsToConnect: [],
  })
  input.srj.traces = [
    {
      type: "pcb_trace",
      pcb_trace_id: "fixed-trace",
      connection_name: "fixed-branch",
      route: [
        { route_type: "wire", x: 0, y: 0, layer: "top", width: 0.2 },
        { route_type: "wire", x: 0, y: 1000, layer: "top", width: 0.2 },
      ],
    },
  ]
  const before = structuredClone(input.srj.traces)
  const region = extractRepairRegion(input)
  const junction = region.routes[0]!.route.findIndex(
    (point) => point.x === 0 && point.y === 0,
  )
  expect(region.lockedPointIndices[0]![junction]).toBe(true)
  for (const [index, point] of region.routes[1]!.route.entries())
    if (point.x === 0 && point.y === 1)
      expect(region.lockedPointIndices[1]![index]).toBe(true)
  expect(region.srj.traces).toHaveLength(1)
  expect(region.srj.traces![0]!.route.at(-1)).toEqual({
    route_type: "wire",
    x: 0,
    y: region.contextBounds.maxY,
    layer: "top",
    width: 0.2,
  })
  expect(input.srj.traces).toEqual(before)
  expect(
    mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: region.routes,
    }),
  ).toEqual(input.routes)
})
