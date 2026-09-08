import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("spatial columns preserve rotated detours, layer transitions and exact work limits", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const route = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.4,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
  }
  const start = route.route[0]!,
    end = route.route[1]!
  const planarPath = [
    start,
    { x: 0.5, y: -3.5, z: 0, traceThickness: 0.1 },
    { x: 2.5, y: -2.5, z: 0, traceThickness: 0.1 },
    end,
  ]
  const layerPath = [
    start,
    { x: -1.5, y: 0.5, z: 0, traceThickness: 0.1 },
    { x: -1.5, y: 0.5, z: 1, traceThickness: 0.1 },
    { x: 0.5, y: 0.5, z: 1, traceThickness: 0.1 },
    { x: 0.5, y: 0.5, z: 0, traceThickness: 0.1 },
    end,
  ]
  const cases = [
    {
      height: 6,
      rotation: 17,
      layers: false,
      limit: 4000,
      path: planarPath,
      nodes: 42,
      reason: "found",
    },
    {
      height: 6,
      rotation: 17,
      layers: false,
      limit: 2,
      path: null,
      nodes: 2,
      reason: "node-limit",
    },
    {
      height: 20,
      rotation: 0,
      layers: false,
      limit: 4000,
      path: null,
      nodes: 80,
      reason: "no-path",
    },
    {
      height: 6,
      rotation: 17,
      layers: true,
      limit: 4000,
      path: layerPath,
      nodes: 37,
      reason: "found",
    },
  ] as const
  // Expectations were captured from the published solver before tightening its
  // barrier bounds or replacing string cell keys; no alternate solver is used.
  for (const scenario of cases) {
    const input: Parameters<typeof findClearancePath>[0] = {
      srj: {
        layerCount: 2,
        minTraceWidth: 0.1,
        bounds,
        connections: [],
        obstacles: [
          {
            type: "rect",
            center: { x: 0, y: 0 },
            width: 0.2,
            height: scenario.height,
            ccwRotationDegrees: scenario.rotation,
            layers: ["top"],
            connectedTo: [],
          },
        ],
      },
      routes: [route],
      routeIndex: 0,
      start,
      end,
      bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.12,
      gridSize: 1,
      allowLayerChanges: scenario.layers,
      maxNodes: scenario.limit,
    }
    const original = structuredClone(input)
    const stats: ClearancePathSearchStats = {
      nodesPopped: 0,
      completionReason: "no-path",
    }
    expect(findClearancePath({ ...input, stats })).toEqual(scenario.path)
    expect(stats).toEqual({
      nodesPopped: scenario.nodes,
      completionReason: scenario.reason,
    })
    expect(input).toEqual(original)
  }
})
