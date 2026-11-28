import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { extractRepairRegion, FindClearancePathSolver } from "../lib"

const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
const route = (points: HighDensityRoute["route"]): HighDensityRoute => ({
  connectionName: "signal",
  traceThickness: 0.15,
  viaDiameter: 0.3,
  route: points,
  vias: [],
})

test("a blocked terminal keeps its approach while the clear interior reroutes", () => {
  const start = { x: -3, y: 0, z: 0, pcb_port_id: "port" }
  const approach = { x: -2, y: 0, z: 0 }
  const end = { x: 3, y: 0, z: 0 }
  const existingPath = [start, approach, { x: 0, y: 0, z: 0 }, end]
  const srj: SimpleRouteJson = {
    bounds,
    connections: [],
    layerCount: 2,
    minTraceWidth: 0.15,
    obstacles: [
      {
        type: "oval",
        shape: "circle",
        center: start,
        width: 0.6,
        height: 0.6,
        layers: ["top", "bottom"],
        connectedTo: [],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top", "bottom"],
        connectedTo: [],
      },
    ],
  }
  const input = {
    srj,
    start,
    end,
    existingPath,
    bounds,
    routes: [route(existingPath)],
    routeIndex: 0,
    traceThickness: 0.15,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
  }
  const strict = new FindClearancePathSolver(input)
  strict.solve()
  expect(strict.getOutput()).toBeNull()
  const repair = new FindClearancePathSolver({
    ...input,
    preserveBlockedAnchorApproaches: true,
  })
  repair.solve()
  const result = repair.getOutput()
  expect(result?.slice(0, 2)).toEqual([start, approach])
  expect(result?.at(-1)).toEqual(end)
  expect(result?.some((point) => Math.abs(point.y) > 0.675)).toBe(true)
  const cannotRetreat = new FindClearancePathSolver({
    ...input,
    existingPath: [
      { ...start, toNextSegmentType: "through_obstacle" },
      ...existingPath.slice(1),
    ],
    preserveBlockedAnchorApproaches: true,
  })
  cannotRetreat.solve()
  expect(cannotRetreat.getOutput()).toBeNull()
})

test("an extracted board edge reserves the declared copper clearance once", () => {
  const start = { x: -2, y: -4.7, z: 0 }
  const end = { x: 2, y: -4.7, z: 0 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.15,
    minBoardEdgeClearance: 0.2,
    connections: [],
    obstacles: [],
  }
  const regional = extractRepairRegion({ srj, routes: [], bounds })
  const input = {
    srj: regional.srj,
    bounds: regional.contextBounds,
    routes: [route([start, end])],
    routeIndex: 0,
    start,
    end,
    existingPath: [start, end],
    traceThickness: 0.15,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
  }
  const legacy = new FindClearancePathSolver(input)
  legacy.solve()
  expect(legacy.getOutput()).toBeNull()
  const exact = new FindClearancePathSolver({
    ...input,
    useExactBoardEdgeClearance: true,
  })
  exact.solve()
  expect(exact.getOutput()).toEqual([start, end])
  const movedStart = { ...start, y: -4.75 }
  const blocked = new FindClearancePathSolver({
    ...input,
    start: movedStart,
    existingPath: [movedStart, end],
    useExactBoardEdgeClearance: true,
  })
  blocked.solve()
  expect(blocked.getOutput()).toBeNull()
})
