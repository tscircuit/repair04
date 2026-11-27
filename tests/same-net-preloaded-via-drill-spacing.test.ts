import { expect, test } from "bun:test"
import "bun-match-svg"
import { getSvgFromGraphicsObject } from "graphics-debug"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { findClearancePath } from "../lib/findClearancePath"

test("an iCE/Pi supply branch approaches a preloaded via on the same net", async () => {
  // The two drill centers from the +1V5 branches, translated to the first via.
  const existingVia = { x: 0, y: 0 }
  const proposedVia = { x: -0.09, y: 0.155 }
  const bounds = { minX: -1.4, minY: -1, maxX: 1.4, maxY: 1 }
  const existingViaPoint = {
    route_type: "via",
    ...existingVia,
    from_layer: "top",
    to_layer: "bottom",
    via_diameter: 0.45,
    via_hole_diameter: 0.2,
  } as const
  const srj: SimpleRouteJson & {
    minViaHoleEdgeToViaHoleEdgeClearance: number
  } = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.1,
    minViaHoleEdgeToViaHoleEdgeClearance: 0.2,
    obstacles: [],
    connections: [],
    traces: [
      {
        type: "pcb_trace",
        pcb_trace_id: "existing-supply-branch",
        connection_name: "+1V5",
        route: [
          { route_type: "wire", ...existingVia, layer: "top", width: 0.1 },
          existingViaPoint,
          { route_type: "wire", ...existingVia, layer: "bottom", width: 0.1 },
        ],
      },
    ],
  }
  const branch: HighDensityRoute = {
    connectionName: "+1V5",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [
      { x: -1, y: 0.45, z: 0 },
      { ...proposedVia, z: 0 },
      { ...proposedVia, z: 1 },
      { x: 1, y: 0.45, z: 1 },
    ],
    vias: [proposedVia],
  }
  const search = {
    srj,
    routes: [branch],
    routeIndex: 0,
    start: branch.route[0]!,
    end: branch.route.at(-1)!,
    bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.2,
    gridSize: 0.05,
    existingPath: branch.route,
  }
  const path = findClearancePath(search)
  expect(path).not.toBeNull()
  const stepped = new FindClearancePathSolver(search)
  stepped.solve()
  expect(stepped.getOutput()).toEqual(path)
  const via = path!.find((p, i) => i > 0 && p.z !== path![i - 1]!.z)!
  expect(Math.hypot(via.x, via.y)).toBeCloseTo(0.17923448, 6)

  const svg = getSvgFromGraphicsObject(
    {
      coordinateSystem: "cartesian",
      lines: path!.flatMap((p, i) =>
        i > 0 && p.z === path![i - 1]!.z
          ? [
              {
                points: [path![i - 1]!, p],
                strokeColor: p.z === 0 ? "#cf4a3c" : "#3975b7",
                strokeWidth: 0.1,
              },
            ]
          : [],
      ),
      circles: [existingVia, via].flatMap((center) => [
        { center, radius: 0.225, fill: "#d7a455", stroke: "#976428" },
        { center, radius: 0.1, fill: "white", stroke: "#413526" },
      ]),
    },
    { backgroundColor: "white", svgWidth: 640, svgHeight: 320 },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
