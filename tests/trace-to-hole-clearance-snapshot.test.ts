import { expect, test } from "bun:test"
import "bun-match-svg"
import {
  segmentToBoundsMinDistance,
  segmentToCircleMinDistance,
} from "@tscircuit/math-utils"
import {
  getSvgFromGraphicsObject,
  stackGraphicsHorizontally,
  type GraphicsObject,
} from "graphics-debug"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

const srj: SimpleRouteJson = {
  layerCount: 2,
  minTraceWidth: 0.2,
  minTraceToPadEdgeClearance: 0.35,
  bounds: { minX: -4, maxX: 4, minY: -2, maxY: 2 },
  connections: [],
  obstacles: [
    {
      type: "rect",
      isNonPlatedHole: true,
      shape: "circle",
      center: { x: -1.3, y: 0 },
      width: 1.2,
      height: 1.2,
      layers: ["top", "bottom"],
      connectedTo: [],
    },
    {
      type: "rect",
      isNonPlatedHole: true,
      center: { x: 1.3, y: 0 },
      width: 1.2,
      height: 1.2,
      layers: ["top", "bottom"],
      connectedTo: [],
    },
  ],
}
const inputRoute: HighDensityRoute = {
  connectionName: "signal",
  traceThickness: 0.2,
  viaDiameter: 0.4,
  vias: [],
  route: [
    { x: -3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ],
}

function drawRoute(route: HighDensityRoute, color: string): GraphicsObject {
  return {
    coordinateSystem: "cartesian",
    rects: [
      {
        center: { x: 0, y: 0 },
        width: 8,
        height: 4,
        fill: "transparent",
        stroke: "#cbd5e1",
      },
      ...srj.obstacles
        .filter((hole) => hole.shape !== "circle")
        .map((hole) => ({
          center: hole.center,
          width: hole.width,
          height: hole.height,
          fill: "#e2e8f0",
          stroke: "#475569",
        })),
    ],
    circles: srj.obstacles
      .filter((hole) => hole.shape === "circle")
      .map((hole) => ({
        center: hole.center,
        radius: hole.width / 2,
        fill: "#e2e8f0",
        stroke: "#475569",
      })),
    lines: [
      {
        points: route.route,
        strokeColor: color,
        strokeWidth: route.traceThickness,
      },
    ],
  }
}

test("hole clearance visibly changes the repaired path with fixed endpoints", async () => {
  const before = structuredClone({ srj, inputRoute })
  const panels = [drawRoute(inputRoute, "#dc2626")]
  const outputPaths: HighDensityRoute["route"][] = []
  for (const clearance of [0, 0.2, 0.5]) {
    const problem = { ...srj, minTraceToHoleEdgeClearance: clearance }
    expect(
      getFixedObstacleViolations({ srj: problem, routes: [inputRoute] }).length,
    ).toBeGreaterThan(0)
    const path = findClearancePath({
      srj: problem,
      routes: [inputRoute],
      routeIndex: 0,
      start: inputRoute.route[0]!,
      end: inputRoute.route[1]!,
      bounds: srj.bounds,
      traceThickness: inputRoute.traceThickness,
      traceClearance: 0.1,
      viaClearance: 0.1,
      allowLayerChanges: false,
      gridSize: 0.025,
    })
    expect(path).not.toBeNull()
    const output = { ...inputRoute, route: path! }
    expect(output.route[0]).toEqual(inputRoute.route[0])
    expect(output.route.at(-1)).toEqual(inputRoute.route.at(-1))
    expect(
      getFixedObstacleViolations({ srj: problem, routes: [output] }),
    ).toEqual([])
    for (let i = 1; i < output.route.length; i++) {
      const start = output.route[i - 1]!
      const end = output.route[i]!
      for (const hole of srj.obstacles) {
        const distance =
          hole.shape === "circle"
            ? segmentToCircleMinDistance(start, end, {
                ...hole.center,
                radius: hole.width / 2,
              })
            : segmentToBoundsMinDistance(start, end, {
                minX: hole.center.x - hole.width / 2,
                maxX: hole.center.x + hole.width / 2,
                minY: hole.center.y - hole.height / 2,
                maxY: hole.center.y + hole.height / 2,
              })
        expect(distance - output.traceThickness / 2).toBeGreaterThanOrEqual(
          clearance - 1e-8,
        )
      }
    }
    outputPaths.push(path!)
    panels.push(drawRoute(output, "#2563eb"))
  }
  expect(outputPaths[0]).not.toEqual(outputPaths[1])
  expect(outputPaths[1]).not.toEqual(outputPaths[2])
  expect({ srj, inputRoute }).toEqual(before)
  const svg = getSvgFromGraphicsObject(
    stackGraphicsHorizontally(panels, {
      titles: [
        "Input",
        "0.0 mm clearance",
        "0.2 mm clearance",
        "0.5 mm clearance",
      ],
    }),
    { backgroundColor: "white", svgWidth: 1400, svgHeight: 320 },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
