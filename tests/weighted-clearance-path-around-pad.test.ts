import { expect, test } from "bun:test"
import "bun-match-svg"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
} from "../lib/findClearancePath"

test("weighted clearance search routes around a rectangular pad", async () => {
  const start = { x: 0.6, y: 1.1, z: 0 }
  const end = { x: 6.2, y: 6.8, z: 0 }
  const bounds = { minX: 0, maxX: 8, minY: 0, maxY: 8 }
  const pad = { center: { x: 3.4, y: 3.9 }, width: 1.7, height: 1.6 }
  const input: ClearancePathInput = {
    srj: {
      bounds,
      layerCount: 1,
      minTraceWidth: 0.124,
      connections: [],
      obstacles: [{ ...pad, type: "rect", layers: ["top"], connectedTo: [] }],
    },
    routes: [
      {
        connectionName: "signal",
        traceThickness: 0.124,
        viaDiameter: 0.45,
        vias: [],
        route: [start, end],
      },
    ],
    routeIndex: 0,
    start,
    end,
    bounds,
    gridSize: 0.2,
    traceThickness: 0.124,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
    heuristicWeight: 3,
  }

  const solver = new FindClearancePathSolver(input)
  solver.solve()
  const path = solver.getOutput()
  expect(path).toEqual(findClearancePath(input))
  expect(path?.at(0)).toMatchObject(start)
  expect(path?.at(-1)).toMatchObject(end)
  const svg = getSvgFromGraphicsObject(
    {
      coordinateSystem: "cartesian",
      rects: [{ ...pad, fill: "#fda4af", stroke: "#be123c" }],
      lines: [
        {
          points: path!,
          strokeWidth: input.traceThickness,
          strokeColor: "#2563eb",
        },
      ],
      circles: [start, end].map((center) => ({
        center,
        radius: 0.15,
        fill: "#1e3a8a",
      })),
    },
    { svgWidth: 480, svgHeight: 480, backgroundColor: "white" },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
