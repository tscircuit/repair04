import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("conversion preserves point widths, port identities, and the declared root net", () => {
  const points: RepairRoutePoint[] = [
    { x: -4, y: 0, z: 0, traceThickness: 0.5, pcb_port_id: "pcb_port_start" },
    { x: -2, y: 0, z: 0, traceThickness: 0.5 },
    { x: -2, y: 0, z: 1, traceThickness: 0.2 },
    { x: 0, y: 0, z: 1 },
    { x: 4, y: 0, z: 1, traceThickness: 0.3, pcb_port_id: "pcb_port_end" },
  ]
  const route: HighDensityRoute = {
    connectionName: "signal-fragment-2",
    rootConnectionName: "declared-net",
    traceThickness: 0.1,
    viaDiameter: 0.75,
    vias: [{ x: -2, y: 0 }],
    route: points,
  }
  const original = structuredClone(route)
  const [converted] = convertRepairRoutesToTraces([route], 2)
  expect(converted!.connection_name).toBe("declared-net")
  const wires = converted!.route.filter((point) => point.route_type === "wire")
  expect(wires.map((point) => point.width)).toEqual([0.5, 0.5, 0.2, 0.1, 0.3])
  expect(wires[0]!.start_pcb_port_id).toBe("pcb_port_start")
  expect(wires.at(-1)!.end_pcb_port_id).toBe("pcb_port_end")
  expect(
    converted!.route.find((point) => point.route_type === "via"),
  ).toMatchObject({ via_diameter: 0.75 })
  expect(route).toEqual(original)

  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [{ name: "declared-net", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: -3, y: 0.35 },
        width: 0.2,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["pcb_smtpad_width_sensitive"],
      },
    ],
  }
  const errors = new AutoroutingDrcEngine(srj).evaluate([converted!]).errors
  expect(
    errors.some((error) =>
      error.message.includes("pcb_smtpad_width_sensitive"),
    ),
  ).toBe(true)
  const narrowRoute = structuredClone(route)
  for (const point of narrowRoute.route as RepairRoutePoint[])
    delete point.traceThickness
  expect(
    new AutoroutingDrcEngine(srj).evaluate(
      convertRepairRoutesToTraces([narrowRoute], 2),
    ).errors,
  ).toEqual([])
})
