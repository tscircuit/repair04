import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"

test("physical repair guards distinguish pour antipads from solid pad collisions", (): void => {
  const via: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    layerCount: 4,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 4,
        height: 4,
        layers: ["inner1"],
        connectedTo: ["GND"],
        isCopperPour: true,
      },
    ],
  }
  expect(getFixedObstacleViolations({ srj, routes: [via] })).toHaveLength(0)
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: [{ ...via, route: [], vias: [] }],
      routes: [via],
    }),
  ).toHaveLength(0)
  const wire = {
    ...via,
    route: [
      { x: -1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ],
    vias: [],
  }
  expect(getFixedObstacleViolations({ srj, routes: [wire] })).toHaveLength(1)
  const aliasedPlane = structuredClone(srj)
  aliasedPlane.obstacles[0]!.connectedTo.push("pcb_port_ground")
  expect(
    getFixedObstacleViolations({ srj: aliasedPlane, routes: [wire] }),
  ).toHaveLength(1)
  expect(
    getFixedObstacleViolations({ srj: aliasedPlane, routes: [via] }),
  ).toHaveLength(0)
  const ownPlane = structuredClone(srj)
  ownPlane.obstacles[0]!.connectedTo = ["signal"]
  expect(
    getFixedObstacleViolations({ srj: ownPlane, routes: [wire, via] }),
  ).toHaveLength(0)
  expect(
    getNewViaPadViolations({
      srj: ownPlane,
      previousRoutes: [{ ...via, route: [], vias: [] }],
      routes: [via],
    }),
  ).toHaveLength(0)
  const solid = structuredClone(srj)
  solid.obstacles[0]!.isCopperPour = false
  expect(
    getFixedObstacleViolations({ srj: solid, routes: [via] }),
  ).toHaveLength(1)
  expect(
    getNewViaPadViolations({
      srj: solid,
      previousRoutes: [{ ...via, route: [], vias: [] }],
      routes: [via],
    }),
  ).toHaveLength(1)
  const pad = structuredClone(srj)
  pad.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 0.5,
    height: 0.5,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_1", "other"],
  })
  expect(
    getNewViaPadViolations({
      srj: pad,
      previousRoutes: [{ ...via, route: [], vias: [] }],
      routes: [via],
    }),
  ).toHaveLength(1)
})
