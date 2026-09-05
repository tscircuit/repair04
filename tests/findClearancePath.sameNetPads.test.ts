import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"

test("layer-changing search exits its own pads before adding vias and respects trace-only mode", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "signal-net",
    traceThickness: 0.2,
    viaDiameter: 0.4,
    vias: [],
    route: [
      { x: -1.3, y: 0, z: 0, pcb_port_id: "start" },
      { x: 1.3, y: 0, z: 0, pcb_port_id: "end" },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.2,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [
      { name: "signal", rootConnectionName: "signal-net", pointsToConnect: [] },
    ],
    obstacles: [
      {
        type: "rect",
        center: { x: -1.3, y: 0 },
        width: 2,
        height: 2,
        connectedTo: ["pcb_smtpad_start", "signal-net"],
        layers: ["top"],
      },
      {
        type: "rect",
        center: { x: 1.3, y: 0 },
        width: 2,
        height: 2,
        connectedTo: ["pcb_smtpad_end", "signal-net"],
        layers: ["top"],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.4,
        height: 12,
        connectedTo: ["pcb_smtpad_foreign"],
        layers: ["top"],
      },
    ],
  }
  // The foreign pad blocks the top layer through the entire local bounds.
  // Ignoring the own pads chooses vias inside them at x≈±0.55, y≈0.
  const input: Parameters<typeof findClearancePath>[0] = {
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: srj.bounds,
    traceThickness: route.traceThickness,
    traceClearance: 0.1,
    viaClearance: 0.1,
  }
  const path = findClearancePath({ ...input, allowLayerChanges: true })
  expect(path).not.toBeNull()
  expect(path![0]).toEqual(route.route[0])
  expect(path!.at(-1)).toEqual(route.route[1])
  const vias = path!.filter(
    (point, index): boolean => index > 0 && point.z !== path![index - 1]!.z,
  )
  expect(vias.length).toBeGreaterThanOrEqual(2)
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: [route],
      routes: [{ ...route, route: path! }],
      viaClearance: 0.1,
    }),
  ).toEqual([])
  expect(findClearancePath({ ...input, allowLayerChanges: false })).toBeNull()

  // A shorter wall admits a real top-layer detour, rather than satisfying the
  // trace-only assertion merely by returning no route.
  const detourSrj = structuredClone(srj)
  detourSrj.obstacles[2]!.height = 0.8
  const traceOnly = findClearancePath({
    ...input,
    srj: detourSrj,
    allowLayerChanges: false,
  })
  expect(traceOnly).not.toBeNull()
  expect(traceOnly![0]).toEqual(route.route[0])
  expect(traceOnly!.at(-1)).toEqual(route.route[1])
  expect(traceOnly!.every((point): boolean => point.z === 0)).toBe(true)
  expect(traceOnly!.some((point): boolean => Math.abs(point.y) > 0.5)).toBe(
    true,
  )
})
