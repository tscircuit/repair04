import { expect, test } from "bun:test"
import "bun-match-svg"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getSegmentToSegmentMinDistance } from "../lib/getSegmentToSegmentMinDistance"

// Actual source_trace_43/via49 at H616 U1 BALL_R3. Keep the original grid
// phase and every native pad, physical fixed-data segment, through barrel,
// and immutable anchor within a conservative copper-radius/clearance halo.
// This is a physical crop, not a replay of the full board's search ordering.
const bounds = {
  minX: 0.3515407603050775,
  maxX: 2.009040760305078,
  minY: 14.674999999999994,
  maxY: 16.429999999999993,
}
const layerNames = ["top", "inner1", "inner2", "bottom"]
const obstacles: (SimpleRouteJson["obstacles"][number] & {
  componentId?: string
  circuitJsonMetadata?: { pcb_smtpad_id: string }
})[] = []

const pads: [number, number | null, number, number][] = [
  [204, 15, 1.989999999999997, 16.699999999999996],
  [205, 3, 1.989999999999997, 16.049999999999997],
  [206, null, 1.989999999999997, 15.399999999999997],
  [207, 12, 1.989999999999997, 14.749999999999996],
  [220, 44, 1.3399999999999972, 16.699999999999996],
  [221, 45, 1.3399999999999972, 16.049999999999997],
  [222, 43, 1.3399999999999972, 15.399999999999997],
  [223, 8, 1.3399999999999972, 14.749999999999996],
  [233, null, 0.6899999999999977, 16.699999999999996],
  [234, 4, 0.6899999999999977, 16.049999999999997],
  [235, null, 0.6899999999999977, 15.399999999999997],
  [236, 14, 0.6899999999999977, 14.749999999999996],
  [252, 42, 0.03999999999999737, 16.699999999999996],
  [253, 47, 0.03999999999999737, 16.049999999999997],
  [254, 6, 0.03999999999999737, 15.399999999999997],
  [255, 2, 0.03999999999999737, 14.749999999999996],
]
for (const [id, net, x, y] of pads) {
  obstacles.push({
    type: "rect",
    shape: "circle",
    componentId: "pcb_component_0",
    circuitJsonMetadata: { pcb_smtpad_id: `pcb_smtpad_${id}` },
    center: { x, y },
    width: 0.35,
    height: 0.35,
    layers: ["top"],
    zLayers: [0],
    connectedTo: net === null ? [] : [`source_trace_${net}`],
  })
}

// Physical fixed data copper, clipped with the existing
// extractFixedTraceContext to bounds expanded by 0.55 mm: moving via radius
// 0.175 + maximum declared clearance 0.2 + fixed via radius 0.175.
// Keep both fragments of source_trace_15 and the adjacent source_trace_3 via.
const fixedDataPoints: [number, [number, number, number][]][] = [
  [
    8,
    [
      [1.3399999999999972, 14.749999999999996, 0],
      [1.0150000000000001, 14.425, 0],
      [1.0150000000000001, 14.425, 2],
      [-0.19845923969492252, 14.425, 2],
    ],
  ],
  [
    12,
    [
      [1.989999999999997, 14.749999999999996, 0],
      [1.6650000000000003, 14.425, 0],
      [1.6650000000000003, 14.425, 3],
      [1.3649999999999924, 14.124999999999993, 3],
    ],
  ],
  [
    10,
    [
      [2.559040760305078, 14.669040760305077, 0],
      [2.3150000000000004, 14.425, 0],
      [2.3150000000000004, 14.425, 1],
      [1.9794999999999918, 14.76050000000001, 1],
      [-0.1984592396949223, 14.76050000000001, 1],
    ],
  ],
  [
    2,
    [
      [0.03999999999999737, 14.749999999999996, 0],
      [-0.13549999999999152, 14.574500000000008, 0],
      [-0.19845923969492252, 14.574500000000008, 0],
    ],
  ],
  [
    14,
    [
      [0.6899999999999977, 14.749999999999996, 0],
      [0.364999999999998, 15.074999999999996, 0],
      [0.364999999999998, 15.724999999999996, 0],
      [0.364999999999998, 15.724999999999996, 1],
      [0.2840000000000056, 15.644000000000004, 1],
      [0.2814999999999994, 15.644000000000004, 1],
      [0.09549999999999947, 15.644000000000004, 1],
      [-0.19845923969492252, 15.350040760305081, 1],
    ],
  ],
  [
    6,
    [
      [0.03999999999999737, 15.399999999999997, 0],
      [-0.19845923969492252, 15.638459239694921, 0],
    ],
  ],
  [
    4,
    [
      [0.6899999999999977, 16.049999999999997, 0],
      [0.3649999999999993, 16.375, 0],
      [0.3649999999999993, 16.375, 1],
      [0.2589999999999941, 16.481000000000005, 1],
      [-0.19845923969492252, 16.481000000000005, 1],
    ],
  ],
  [
    7,
    [
      [2.559040760305078, 16.130959239694917, 0],
      [2.3149999999999986, 16.375, 0],
      [2.3149999999999986, 16.375, 2],
      [1.4442500000000007, 16.375, 2],
      [1.1057499999999973, 16.713500000000003, 2],
      [-0.19845923969492252, 16.713500000000003, 2],
    ],
  ],
  [
    15,
    [
      [1.989999999999997, 16.699999999999996, 0],
      [1.7100000000000037, 16.979999999999993, 0],
    ],
  ],
  [
    15,
    [
      [1.619999999999994, 16.979999999999993, 1],
      [1.353500000000004, 16.713500000000003, 1],
      [-0.19845923969492252, 16.713500000000003, 1],
    ],
  ],
  [
    5,
    [
      [2.559040760305078, 15.319040760305077, 0],
      [2.3150000000000004, 15.075, 0],
      [2.3150000000000004, 15.075, 2],
      [-0.1984592396949223, 15.075, 2],
    ],
  ],
  [
    3,
    [
      [1.989999999999997, 16.049999999999997, 0],
      [1.6650000000000003, 15.725, 0],
      [1.6650000000000003, 15.725, 1],
      [1.6650000000000003, 16.26, 1],
      [2.0020000000000007, 16.597, 1],
      [2.0020000000000007, 16.979999999999993, 1],
    ],
  ],
]
const fixedData: HighDensityRoute[] = fixedDataPoints.map(([net, points]) => {
  const route = points.map(([x, y, z]) => ({ x, y, z }))
  return {
    connectionName: `source_trace_${net}`,
    traceThickness: 0.0975,
    viaDiameter: 0.35,
    route,
    vias: route.slice(1).flatMap((b, index) =>
      b.z === route[index]!.z ? [] : [{ x: b.x, y: b.y }],
    ),
  }
})
const srj: SimpleRouteJson & {
  minViaHoleDiameter: number
  allowViaInPad: boolean
  allowBlindAndBuriedVias: boolean
} = {
  layerCount: 4,
  minTraceWidth: 0.093,
  minViaDiameter: 0.35,
  minViaHoleDiameter: 0.15,
  minTraceToPadEdgeClearance: 0.1,
  minTraceToHoleEdgeClearance: 0.2,
  minViaEdgeToPadEdgeClearance: 0.1,
  allowViaInPad: false,
  allowBlindAndBuriedVias: false,
  bounds,
  connections: [],
  obstacles,
}
const anchorPoints: [number, number, number, number][] = [
  [47, 0.03999999999999737, 16.049999999999997, 0.093],
  [45, 1.3399999999999972, 16.049999999999997, 0.093],
  [44, 1.3399999999999972, 16.699999999999996, 0.093],
  [43, 1.3399999999999972, 15.399999999999997, 0.0975],
  [42, 0.03999999999999737, 16.699999999999996, 0.093],
 ]
const anchors: HighDensityRoute[] = anchorPoints.map(([net, x, y, width]) => {
  const point = { x, y, z: 0 }
  return {
    connectionName: `source_trace_${net}`,
    traceThickness: width,
    viaDiameter: 0.35,
    vias: [],
    route: [point, point],
  }
})
const source: HighDensityRoute = {
  connectionName: "source_trace_43",
  traceThickness: 0.0975,
  viaDiameter: 0.35,
  vias: [{ x: 1.18872857803334, y: 15.200958655307026 }],
  route: [
    { x: 1.1864455718990217, y: 15.222445571899023, z: 3 },
    { x: 1.1864455718990221, y: 15.222445571899023, z: 3 },
    { x: 1.18872857803334, y: 15.200958655307026, z: 3 },
    { x: 1.18872857803334, y: 15.200958655307026, z: 0 },
    { x: 1.264, y: 15.324, z: 0 },
    { x: 1.3399999999999972, y: 15.399999999999997, z: 0 },
  ],
}

function draw(path: HighDensityRoute["route"] | null): string {
  const graphics: GraphicsObject & {
    rects: NonNullable<GraphicsObject["rects"]>
    circles: NonNullable<GraphicsObject["circles"]>
    lines: NonNullable<GraphicsObject["lines"]>
    texts: NonNullable<GraphicsObject["texts"]>
  } = {
    coordinateSystem: "screen",
    rects: [
      {
        center: { x: 510, y: 525 },
        width: 1020,
        height: 1050,
        fill: "transparent",
        stroke: "none",
      },
    ],
    circles: [],
    lines: [],
    texts: [
      {
        x: 30,
        y: 30,
        text: "H616: escape BALL_R3 around native round pads",
        fontSize: 24,
        anchorSide: "center_left",
      },
      {
        x: 30,
        y: 58,
        text: path
          ? "Legal replacement found; native pads and fixed data copper retained"
          : "No replacement found; original colliding route retained for this repro",
        fontSize: 17,
        anchorSide: "center_left",
      },
    ],
  }
  const displayed = path ?? source.route
  const scale = 150
  for (let z = 0; z < 4; z++) {
    const left = 30 + (z % 2) * 500
    const top = 110 + Math.floor(z / 2) * 465
    const point = (p: { x: number; y: number }) => ({
      x: left + (p.x + 0.2) * scale,
      y: top + (17 - p.y) * scale,
    })
    graphics.texts.push({
      x: left,
      y: top - 15,
      text: layerNames[z]!,
      fontSize: 20,
      anchorSide: "center_left",
    })
    for (const obstacle of obstacles) {
      if (!obstacle.zLayers?.includes(z)) continue
      if (obstacle.shape === "circle") {
        graphics.circles.push({
          center: point(obstacle.center),
          radius: (obstacle.width * scale) / 2,
          fill: "#fde68a",
          stroke: "#92400e",
          layer: `z${z}`,
        })
        continue
      }
    }
    const center = point({
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    })
    graphics.rects.push({
      center,
      width: (bounds.maxX - bounds.minX) * scale,
      height: (bounds.maxY - bounds.minY) * scale,
      fill: "transparent",
      stroke: "#cbd5e1",
      layer: `z${z}`,
    })
    for (const route of [...fixedData, { ...source, route: displayed }]) {
      const signal = route.connectionName === source.connectionName
      for (let index = 1; index < route.route.length; index++) {
        const a = route.route[index - 1]!
        const b = route.route[index]!
        if (a.z !== b.z) {
          graphics.circles.push({
            center: point(a),
            radius: (route.viaDiameter * scale) / 2,
            fill: signal ? "#2563eb" : "#94a3b8",
            stroke: signal ? "#1e3a8a" : "#475569",
            layer: `z${z}`,
          })
          graphics.circles.push({
            center: point(a),
            radius: (srj.minViaHoleDiameter * scale) / 2,
            fill: "white",
            stroke: "none",
            layer: `z${z}`,
          })
        } else if (a.z === z) {
          graphics.lines.push({
            points: [point(a), point(b)],
            strokeColor: signal ? (path ? "#16a34a" : "#dc2626") : "#64748b",
            strokeWidth: route.traceThickness * scale,
            ...(z > 0 ? { strokeDash: "5 3" } : {}),
            layer: `z${z}`,
          })
        }
      }
    }
  }

  return getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 1020,
    svgHeight: 1050,
  })
}

test("H616: find a via column between native round pads", async () => {
  const input = {
    srj,
    routes: [...fixedData, ...anchors, source],
    routeIndex: fixedData.length + anchors.length,
    start: source.route[0]!,
    end: source.route.at(-1)!,
    bounds,
    traceThickness: source.traceThickness,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    gridSize: 0.0975,
    heuristicWeight: 3,
    allowLayerChanges: true,
    existingPath: source.route,
  }
  const original = structuredClone(input)
  const solver = new FindClearancePathSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(input).toEqual(original)
  const originalVia = source.vias[0]!
  const bus5 = fixedData
    .find((route) => route.connectionName === "source_trace_5")!
    .route.filter((point) => point.z === 2)
  const originalGap =
    getSegmentToSegmentMinDistance(originalVia, originalVia, bus5[0]!, bus5[1]!) -
    source.viaDiameter / 2 -
    0.0975 / 2
  expect(originalGap).toBeLessThan(0.1)
  const path = solver.getOutput()
  expect(path).toBeNull()
  if (path) {
    expect(path[0]).toEqual(input.start)
    expect(path.at(-1)).toEqual(input.end)
    const vias = path.slice(1).flatMap((b, index) => {
      const a = path[index]!
      if (a.z === b.z) return []
      expect({ x: a.x, y: a.y }).toEqual({ x: b.x, y: b.y })
      // Check the actual round pads independently of repair04's shape helper.
      for (const [, , x, y] of pads) {
        const edgeGap = Math.hypot(a.x - x, a.y - y) - 0.35
        expect(edgeGap).toBeGreaterThanOrEqual(0.1 - 1e-8)
      }
      return [{ x: a.x, y: a.y }]
    })
    for (let index = 1; index < path.length; index++) {
      const a = path[index - 1]!
      const b = path[index]!
      const movingVia = a.z !== b.z
      const movingRadius = (movingVia ? 0.35 : 0.0975) / 2
      for (const fixed of [...fixedData, ...anchors]) {
        if (fixed.connectionName === source.connectionName) continue
        for (let j = 1; j < fixed.route.length; j++) {
          const c = fixed.route[j - 1]!
          const d = fixed.route[j]!
          const fixedVia = c.z !== d.z
          if (!movingVia && !fixedVia && a.z !== c.z) continue
          const fixedRadius =
            (fixedVia ? fixed.viaDiameter : fixed.traceThickness) / 2
          const edgeGap =
            getSegmentToSegmentMinDistance(a, b, c, d) -
            movingRadius -
            fixedRadius
          expect(edgeGap).toBeGreaterThanOrEqual(0.1 - 1e-8)
        }
      }
    }
    expect(
      getFixedObstacleViolations({
        srj,
        routes: [{ ...source, route: path, vias }],
        traceClearance: 0.1,
        viaClearance: 0.1,
      }),
    ).toEqual([])
  }
  await expect(draw(path)).toMatchSvgSnapshot(import.meta.path)
})
