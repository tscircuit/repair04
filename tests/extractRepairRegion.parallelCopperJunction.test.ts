import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("anchors overlapping parallel copper to a long fixed preload with both endpoints outside the region", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.traceThickness = 0.15
  input.routes[0]!.route = [
    { x: -1000, y: 0, z: 0 },
    { x: 1000, y: 0, z: 0 },
  ]
  input.srj.connections.push({
    name: "fixed-parallel",
    rootConnectionName: "signal-net",
    pointsToConnect: [],
  })
  input.srj.traces = [
    {
      type: "pcb_trace",
      pcb_trace_id: "fixed-parallel",
      connection_name: "fixed-parallel",
      route: [
        { route_type: "wire", x: -1000, y: 0.12, width: 0.15, layer: "top" },
        { route_type: "wire", x: 1000, y: 0.12, width: 0.15, layer: "top" },
      ],
    },
  ]
  const region = extractRepairRegion(input)
  const junctionIndex = region.routes[0]!.route.findIndex(
    (point) => Math.abs(point.x) < 1e-8,
  )
  expect(junctionIndex).toBeGreaterThan(-1)
  expect(region.lockedPointIndices[0]![junctionIndex]).toBe(true)
  input.srj.connections[1]!.rootConnectionName = "different-net"
  expect(
    extractRepairRegion(input).routes[0]!.route.some(
      (point) => Math.abs(point.x) < 1e-8,
    ),
  ).toBe(false)
})
