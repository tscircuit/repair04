import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("a shared immutable endpoint does not exempt a required attachment to fixed preload copper", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -3, y: 1, z: 0, pcb_port_id: "left-port" },
    { x: 0, y: 0.6, z: 0 },
    { x: 3, y: 1, z: 0, pcb_port_id: "shared-port" },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "second-branch",
    rootConnectionName: "signal-net",
    route: [
      { x: -3, y: 2, z: 0, pcb_port_id: "upper-port" },
      { x: 0, y: 0.6, z: 0 },
      { x: 3, y: 1, z: 0, pcb_port_id: "shared-port" },
    ],
  }
  input.srj.connections.push({
    name: "fixed-branch",
    rootConnectionName: "signal-net",
    pointsToConnect: [],
  })
  input.srj.traces = [
    {
      type: "pcb_trace",
      pcb_trace_id: "fixed-branch",
      connection_name: "fixed-branch",
      route: [
        { route_type: "wire", x: 0, y: -3, width: 0.2, layer: "top" },
        { route_type: "wire", x: 0, y: 0.6, width: 0.2, layer: "top" },
      ],
    },
  ]
  const region = extractRepairRegion(input)
  for (let index = 0; index < 2; index += 1) {
    const junctionIndex = region.routes[index]!.route.findIndex(
      (point) => point.x === 0 && point.y === 0.6,
    )
    expect(region.lockedPointIndices[index]![junctionIndex]).toBe(true)
  }
})
