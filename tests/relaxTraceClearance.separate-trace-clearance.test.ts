import { expect, test } from "bun:test"
import "bun-match-svg"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance, type RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("reproduce independent wire-pair clearance being ignored in relaxation", (): void => {
  // Board-world XY positions in mm, +Y up. Fixed lower trace has a valid
  // 0.075 mm pad gap; the upper trace must move to meet the 0.1 mm pair gap.
  const input: RelaxTraceClearanceInput & { differentNetTraceClearance: number } = {
    srj: {
      layerCount: 2, minTraceWidth: 0.1, minTraceToPadEdgeClearance: 0.05,
      bounds: { minX: -3, maxX: 3, minY: -1, maxY: 1 },
      connections: [],
      obstacles: [{ type: "rect", center: { x: 0, y: -0.225 }, width: 0.2,
        height: 0.2, layers: ["top"], connectedTo: ["foreign"] }],
    },
    traceClearance: 0.05,
    differentNetTraceClearance: 0.1,
    bounds: { minX: -3, maxX: 3, minY: -1, maxY: 1 },
    boundaryMargin: 0,
    lockedPointIndices: [[true, true, true, true], [true, false, false, true]],
    routes: [0, 1].map((index) => ({
      connectionName: `net_${index}`, traceThickness: 0.1, viaDiameter: 0.3, vias: [],
      route: [-2, -1, 1, 2].map((x) => ({
        x, y: index === 0 ? 0 : Math.abs(x) === 2 ? 0.6 : 0.175, z: 0,
      })),
    })),
  }
  const original = structuredClone(input)
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  expect(solver.solved).toBe(true)
  const output = solver.getOutput()
  expect(output).toEqual(relaxTraceClearance(input))
  const gap = segmentToSegmentMinDistance(output[0]!.route[1]!, output[0]!.route[2]!,
    output[1]!.route[1]!, output[1]!.route[2]!) - 0.1
  // Before the fix, the independent pair rule is ignored.
  expect(gap).toBeCloseTo(0.075, 8)
  expect(getFixedObstacleViolations({ ...input, routes: output })).toEqual([])
  expect(output[0]).toEqual(input.routes[0])
  expect(output[1]!.route[0]).toEqual(input.routes[1]!.route[0])
  expect(output[1]!.route.at(-1)).toEqual(input.routes[1]!.route.at(-1))
  expect(input).toEqual(original)
  expect(getSvgFromGraphicsObject({
    coordinateSystem: "cartesian",
    lines: output.map((route, index) => ({ points: route.route, strokeWidth: route.traceThickness,
      strokeColor: index === 0 ? "#dc2626" : "#2563eb" })),
    rects: [{ center: { x: 0, y: -0.225 }, width: 0.2, height: 0.2, fill: "#fca5a5" }],
    texts: [{ x: 0, y: 0.9, text: `Trace gap: ${gap.toFixed(3)} mm; required 0.100 mm`, fontSize: 0.15 },
      { x: 0, y: -0.5, text: "Pad gap: 0.075 mm; required 0.050 mm", fontSize: 0.15 }],
  }, { backgroundColor: "white" })).toMatchSvgSnapshot(import.meta.path)
})
