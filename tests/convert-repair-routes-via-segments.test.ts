import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"

test("DRC sees every wire segment arriving at and departing from layer transitions", () => {
  const route: HighDensityRoute = {
    connectionName: "signal-fragment",
    rootConnectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.8,
    vias: [
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: -2, y: 0, z: 0 },
      { x: -2, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 0, z: 3 },
      { x: 4, y: 0, z: 3 },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 4,
    minTraceWidth: 0.15,
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: -3, y: 0 },
        width: 0.1,
        height: 0.1,
        layers: ["top"],
        connectedTo: ["pcb_smtpad_arrival"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.1,
        height: 0.1,
        layers: ["inner1"],
        connectedTo: ["pcb_smtpad_between_vias"],
      },
      {
        type: "rect",
        center: { x: 3, y: 0 },
        width: 0.1,
        height: 0.1,
        layers: ["bottom"],
        connectedTo: ["pcb_smtpad_departure"],
      },
    ],
  }
  const converted = convertRepairRoutesToTraces([route], srj.layerCount)
  const { errors } = new AutoroutingDrcEngine(srj).evaluate(converted)
  expect(errors).toHaveLength(3)
  for (const obstacle of srj.obstacles) {
    expect(
      errors.some((error) => error.message.includes(obstacle.connectedTo[0]!)),
    ).toBe(true)
  }
  expect(
    converted[0]!.route.filter((point) => point.route_type === "wire"),
  ).toHaveLength(route.route.length)
  expect(
    converted[0]!.route.filter((point) => point.route_type === "via"),
  ).toEqual([
    {
      route_type: "via",
      x: -2,
      y: 0,
      from_layer: "top",
      to_layer: "inner1",
      via_diameter: 0.8,
    },
    {
      route_type: "via",
      x: 2,
      y: 0,
      from_layer: "inner1",
      to_layer: "bottom",
      via_diameter: 0.8,
    },
  ])
})
