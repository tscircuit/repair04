import { expect, test } from "bun:test"
import "bun-match-svg"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  createNegotiatedClearanceSearch,
  type NegotiatedClearanceCopper,
  type NegotiatedClearanceSearchInput,
} from "../lib/negotiatedClearanceSearchKernel"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import {
  type PerformanceGraphic,
  expectPerformanceSvg,
  performanceCanvas,
  projectVisual,
  visualText,
} from "./fixtures/performanceVisual"

const sharedHole = { x: -7.599999000000006, y: 0.000001000000000001 }
const competingHole = { x: -7.6, y: 0.07930994003924496 }

function makeTask(): NegotiatedClearanceSearchInput {
  // Native ButterStick source_net_52 MST tails, cropped to their shared BGA
  // escape. Pad diameter, pitch, trace width, drill and via sizes are unchanged.
  const bounds = {
    minX: -7.938124518894602,
    maxX: -6.9,
    minY: -0.6,
    maxY: 0.65,
  }
  const branch: HighDensityRoute = {
    connectionName: "source_net_52_mst1",
    rootConnectionName: "source_net_52",
    traceThickness: 0.089,
    viaDiameter: 0.4,
    vias: [sharedHole],
    route: [
      { x: -7.938124518894602, y: 0.5281245188946023, z: 1 },
      { x: -7.86, y: 0.45, z: 1 },
      { x: -7.8, y: 0.4, z: 1 },
      { x: -7.6, y: 0.2, z: 1 },
      { x: -7.6, y: 0.15, z: 1 },
      { x: -7.598, y: 0.082, z: 1 },
      { ...sharedHole, z: 1 },
      { ...sharedHole, z: 0 },
      { x: -7.599999, y: sharedHole.y, z: 0 },
      { x: -7.2, y: 0.4, z: 0 },
    ],
  }
  const peer: HighDensityRoute = {
    ...branch,
    connectionName: "source_net_52_mst0",
    route: [
      { x: -7.938124518894602, y: -0.31478025007211874, z: 1 },
      { x: -7.690987685285929, y: -0.06764341646344563, z: 1 },
      { x: -7.667643416463451, y: -0.06764341646344563, z: 1 },
      { ...sharedHole, z: 1 },
      { ...sharedHole, z: 0 },
      { x: -7.599999, y: sharedHole.y, z: 0 },
      { x: -7.2, y: 0.4, z: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 8,
    minTraceWidth: 0.089,
    connections: [
      {
        name: branch.connectionName,
        rootConnectionName: "source_net_52",
        pointsToConnect: [
          { x: branch.route[0]!.x, y: branch.route[0]!.y, layer: "inner1" },
          { x: -7.2, y: 0.4, layer: "top" },
        ],
      },
    ],
    obstacles: [],
  }
  for (const x of [
    -8.000000000000005, -7.2000000000000055, -6.400000000000006,
  ]) {
    for (const y of [
      -0.4000000000000057, 0.39999999999999436, 1.1999999999999944,
    ]) {
      const pad: SimpleRouteJson["obstacles"][number] & {
        componentId: string
      } = {
        type: "rect",
        shape: "circle",
        center: { x, y },
        width: 0.4,
        height: 0.4,
        layers: ["top"],
        componentId: "pcb_component_1",
        connectedTo: [
          Math.abs(x + 7.2) < 1e-8 && Math.abs(y - 0.4) < 1e-8
            ? "source_net_52"
            : `pad-${x}-${y}`,
        ],
      }
      srj.obstacles.push(pad)
    }
  }
  // Native fixed through-vias and top-copper rectangles enclosing this escape.
  for (const [x, y, net] of [
    [-7.6, 0.8000000000000003, "source_net_30"],
    [-6.799999999999999, 0.8000000000000003, "source_net_43"],
    [-6.799999999999999, 4.440892098500626e-16, "source_net_32"],
  ] as const) {
    srj.obstacles.push({
      type: "rect",
      shape: "circle",
      center: { x, y },
      width: 0.4,
      height: 0.4,
      layers: [
        "top",
        "inner1",
        "inner2",
        "inner3",
        "inner4",
        "inner5",
        "inner6",
        "bottom",
      ],
      connectedTo: [net],
    })
  }
  for (const [x, y, width, height, net] of [
    [
      -7.000000000000002,
      0.9999999999999973,
      0.1648528137423857,
      0.16485281374238583,
      "source_net_43",
    ],
    [
      -6.920000000000001,
      0.9199999999999985,
      0.1648528137423857,
      0.16485281374238583,
      "source_net_43",
    ],
    [
      -7.400000000000002,
      -0.6000000000000025,
      0.16485281374238447,
      0.16485281374238447,
      "source_net_34",
    ],
  ] as const) {
    srj.obstacles.push({
      type: "rect",
      center: { x, y },
      width,
      height,
      layers: ["top"],
      connectedTo: [net],
    })
  }
  const copper = (
    hole: { x: number; y: number },
    owner: string,
    spanIndex: number,
    index: number,
    toZ: number,
  ): NegotiatedClearanceCopper => ({
    a: { ...hole, z: 1 },
    b: { ...hole, z: toZ },
    radius: 0.2,
    minX: hole.x,
    maxX: hole.x,
    minY: hole.y,
    maxY: hole.y,
    minZ: 0,
    maxZ: 7,
    owner,
    spanIndex,
    index,
    cellX: Math.floor(hole.x - 0.2),
    cellY: Math.floor(hole.y - 0.2),
    immutable: false,
  })
  return {
    pathInput: {
      srj,
      routes: [peer, branch],
      routeIndex: 1,
      bounds,
      start: branch.route[0]!,
      end: branch.route.at(-1)!,
      existingPath: branch.route,
      traceThickness: 0.089,
      traceClearance: 0.1,
      viaClearance: 0.1,
      viaHoleDiameter: 0.2,
      gridSize: 0.089,
      allowLayerChanges: true,
      heuristicWeight: 3,
    },
    // This neighboring mutable via supplies the native positive congestion cost.
    // The selected span may propose moving its peer; acceptance happens only
    // after negotiation reroutes the affected spans and validates the board.
    coppers: [
      copper(competingHole, "pcb_smtpad_20", 0, 0, 7),
      copper(sharedHole, "source_net_52", 1, 1, 0),
    ],
    selectedOwner: "source_net_52",
    weights: [1, 1],
  }
}

function renderResult(
  task: NegotiatedClearanceSearchInput,
  path: RepairRoutePoint[] | null,
  pops: number,
): PerformanceGraphic {
  const graphics = performanceCanvas(
    "ButterStick DDR: let movable peer vias negotiate",
    "Native BGA escape: two same-net MST branches share a drill near a movable foreign-net via.",
  )
  const viewport = { minX: -8.4, maxX: -6, minY: -0.75, maxY: 1.5 }
  const project = projectVisual(viewport, 28, 116, 720, 500)
  const scale = 500 / (viewport.maxY - viewport.minY)
  for (const obstacle of task.pathInput.srj.obstacles) {
    const fill = obstacle.connectedTo.includes("source_net_52")
      ? "#dbeafe"
      : "#e2e8f0"
    if (obstacle.shape === "circle") {
      graphics.circles.push({
        center: project(obstacle.center),
        radius: (obstacle.width / 2) * scale,
        fill,
        stroke: obstacle.layers.length > 1 ? "#475569" : "#94a3b8",
      })
      if (obstacle.layers.length > 1)
        graphics.circles.push({
          center: project(obstacle.center),
          radius: 0.1 * scale,
          fill: "white",
          stroke: "#475569",
        })
    } else
      graphics.rects.push({
        center: project(obstacle.center),
        width: obstacle.width * scale,
        height: obstacle.height * scale,
        fill,
        stroke: "#94a3b8",
      })
  }
  const draw = (route: readonly RepairRoutePoint[], color: string): void => {
    for (let index = 1; index < route.length; index++) {
      const a = route[index - 1]!,
        b = route[index]!
      if (a.z !== b.z) continue
      graphics.lines.push({
        points: [project(a), project(b)],
        strokeWidth: 0.089 * scale,
        strokeColor: color,
        strokeDash: a.z === 0 ? undefined : [6, 5],
      })
    }
  }
  const drawHole = (hole: { x: number; y: number }, color: string): void => {
    graphics.circles.push({
      center: project(hole),
      radius: 0.2 * scale,
      fill: "transparent",
      stroke: color,
    })
    graphics.circles.push({
      center: project(hole),
      radius: 0.1 * scale,
      fill: "white",
      stroke: color,
    })
  }
  draw(task.pathInput.routes[1]!.route, "rgba(3,105,161,0.18)")
  draw(task.pathInput.routes[0]!.route, "#0369a1")
  drawHole(sharedHole, "#0369a1")
  drawHole(competingHole, "#a855f7")
  const via = path?.find(
    (point, index) => index > 0 && point.z !== path[index - 1]!.z,
  )
  if (path) draw(path, "#d97706")
  if (via) drawHole(via, "#d97706")
  const candidateGap = via
    ? Math.hypot(via.x - sharedHole.x, via.y - sharedHole.y)
    : null
  const minimumDrillDistance =
    task.pathInput.viaHoleDiameter! + task.pathInput.viaClearance
  const peerMustMove =
    candidateGap !== null &&
    candidateGap > 0 &&
    candidateGap < minimumDrillDistance
  const captions: [number, string, number?, string?][] = [
    [145, path ? "Candidate path found" : "No candidate path", 24, "#b45309"],
    [180, `${pops} search states popped`, 16, "#475569"],
    [235, "Blue: existing same-net branches", 16, "#0369a1"],
    [265, "Purple: movable foreign-net via", 16, "#a855f7"],
    [295, "Gray: fixed pads, vias and copper", 16, "#475569"],
    [
      480,
      !path
        ? "The search cannot move past the peer."
        : peerMustMove
          ? "The peer requires rerouting."
          : "Peer drill spacing is clear.",
      18,
      "#b45309",
    ],
    [515, "This view is an intermediate search."],
    [545, "Final negotiation must clear conflicts."],
  ]
  if (via)
    captions.push(
      [355, "Orange: provisional search path", 16, "#b45309"],
      [390, `Peer drill distance: ${candidateGap!.toFixed(3)} mm`],
      [420, `Distinct drills require ${minimumDrillDistance.toFixed(3)} mm`],
    )
  for (const [y, text, size = 16, color] of captions)
    visualText(graphics, 790, y, text, size, color)
  visualText(
    graphics,
    32,
    628,
    "Solid copper: top layer. Dashed copper: inner1. Pale blue: the selected input span.",
    15,
    "#475569",
  )
  visualText(
    graphics,
    32,
    656,
    "Pad pitch 0.8 mm; pad/via diameter 0.4 mm; drill diameter 0.2 mm; trace width 0.089 mm.",
    15,
    "#475569",
  )
  return graphics
}

test("ButterStick search can negotiate a movable same-net peer drill", async (): Promise<void> => {
  const task = makeTask()
  const original = structuredClone(task)
  const solver = createNegotiatedClearanceSearch(task)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(task).toEqual(original)
  const path = solver.getOutput()
  expect(path).not.toBeNull()
  if (path) {
    expect(path[0]).toEqual(task.pathInput.start)
    expect(path.at(-1)).toEqual(task.pathInput.end)
    expect(
      getFixedObstacleViolations({
        srj: task.pathInput.srj,
        routes: [{ ...task.pathInput.routes[1]!, route: path }],
        traceClearance: 0.1,
        viaClearance: 0.1,
      }),
    ).toEqual([])
    const vias = path.filter(
      (point, index) => index > 0 && point.z !== path[index - 1]!.z,
    )
    for (let i = 0; i < vias.length; i++)
      for (let j = i + 1; j < vias.length; j++) {
        const gap = Math.hypot(vias[i]!.x - vias[j]!.x, vias[i]!.y - vias[j]!.y)
        expect(
          gap === 0 ||
            gap >=
              task.pathInput.viaHoleDiameter! +
                task.pathInput.viaClearance -
                1e-8,
        ).toBe(true)
      }
  }
  await expectPerformanceSvg(
    renderResult(task, path, solver.stats.nodesPopped),
    import.meta.path,
  )
})
