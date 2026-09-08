import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"

test("layer search honors explicit contained via permission without bypassing foreign pads", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "signal-net",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0.2, y: 0, z: 1 },
    ],
    vias: [],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -0.3, maxX: 0.3, minY: -0.3, maxY: 0.3 },
    connections: [
      { name: "signal", rootConnectionName: "signal-net", pointsToConnect: [] },
    ],
    obstacles: [
      {
        kind: "smt_pad",
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["signal-net", "pcb_smtpad_signal"],
      },
    ],
  }
  const input: Parameters<typeof findClearancePath>[0] = {
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: srj.bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    maxNodes: 2000,
  }
  expect(findClearancePath(input)).toBeNull()
  srj.allowViaInPad = false
  expect(findClearancePath(input)).toBeNull()
  srj.allowViaInPad = true
  const path = findClearancePath(input)
  expect(path).not.toBeNull()
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: [
        { ...route, route: [route.route[0]!, { x: 0.2, y: 0, z: 0 }] },
      ],
      routes: [{ ...route, route: path! }],
    }),
  ).toEqual([])
  expect(findClearancePath({ ...input, allowLayerChanges: false })).toBeNull()
  srj.obstacles[0]!.width = 0.2
  expect(findClearancePath(input)).toBeNull()
  srj.obstacles[0]!.width = 1
  srj.obstacles.push({
    ...srj.obstacles[0]!,
    connectedTo: ["foreign", "pcb_smtpad_foreign"],
  })
  expect(findClearancePath(input)).toBeNull()
})
