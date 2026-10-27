import { beforeAll, expect, test } from "bun:test"
import "bun-match-svg"
import {
  createNewViaPadViolationEvaluator,
  getNewViaPadViolations,
} from "../lib/getNewViaPadViolations"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import type { RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"
import {
  measureClearanceRepro,
  renderClearanceRepro,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"

type PadRuleInput = RelaxTraceClearanceInput & {
  srj: RelaxTraceClearanceInput["srj"] & {
    minPadEdgeToPadEdgeClearance: number
  }
}

const input: PadRuleInput = {
  srj: {
    layerCount: 2,
    minTraceWidth: 0.1,
    minPadEdgeToPadEdgeClearance: 0.15,
    bounds: { minX: -3, maxX: 3, minY: -3, maxY: 3 },
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["foreign", "pcb_smtpad_foreign"],
      },
    ],
    connections: [
      {
        name: "target",
        pointsToConnect: [
          { x: 2, y: -1, layer: "top" },
          { x: 2, y: 1, layer: "bottom" },
        ],
      },
    ],
  },
  routes: [
    {
      connectionName: "target",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: 2, y: -1, z: 0 },
        { x: 0.77, y: 0, z: 0 },
        { x: 0.77, y: 0, z: 1 },
        { x: 2, y: 1, z: 1 },
      ],
      vias: [{ x: 0.77, y: 0 }],
    },
  ],
  bounds: { minX: -3, maxX: 3, minY: -3, maxY: 3 },
  boundaryMargin: 0,
  lockedPointIndices: [[true, false, false, true]],
  traceClearance: 0.1,
  viaClearance: 0.1,
  allowViaMovement: true,
}
const original = structuredClone(input)
const solver = new RelaxTraceClearanceSolver(input)
const fixture: ClearanceVisualReproFixture = {
  name: "foreign-via-pad-minimum",
  title: "Foreign pad needs 0.15 mm; connected pads and via pairs keep their rules",
  provenance: "Policy-focused repro; real Board1726 checkpoint is tested separately",
  viewport: { minX: -0.8, maxX: 1.2, minY: -0.8, maxY: 0.8 },
  viaToPadClearance: 0.15,
  input: {
    ...input,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowViaMovement: true,
  },
}

beforeAll(async (): Promise<void> => {
  const dedicated = structuredClone(input)
  dedicated.srj.minViaEdgeToPadEdgeClearance = 0.05
  const dedicatedSolver = new RelaxTraceClearanceSolver(dedicated)
  dedicatedSolver.solve()
  expect(dedicatedSolver.getOutput()[0]!.vias).toEqual(input.routes[0]!.vias)
  expect(
    getNewViaPadViolations({
      srj: dedicated.srj,
      previousRoutes: dedicated.routes,
      routes: dedicated.routes,
      includeExistingVias: [{ routeIndex: 0, viaIndex: 0 }],
    }),
  ).toEqual([])
  const own = structuredClone(input)
  own.srj.minViaEdgeToPadEdgeClearance = 0.05
  own.srj.obstacles[0]!.connectedTo = ["target", "pcb_smtpad_foreign"]
  const ownSolver = new RelaxTraceClearanceSolver(own)
  ownSolver.solve()
  expect(ownSolver.getOutput()[0]!.vias).toEqual(input.routes[0]!.vias)

  const pairs = structuredClone(input)
  pairs.srj.obstacles = []
  pairs.routes = [0, 0.44].map((x, index) => ({
    connectionName: `pair_${index}`,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x, y: -1, z: 0 },
      { x, y: 0, z: 0 },
      { x, y: 0, z: 1 },
      { x, y: 1, z: 1 },
    ],
    vias: [{ x, y: 0 }],
  }))
  pairs.lockedPointIndices = pairs.routes.map(() => [true, false, false, true])
  const pairSolver = new RelaxTraceClearanceSolver(pairs)
  pairSolver.solve()
  expect(pairSolver.getOutput().map((route) => route.vias)).toEqual(
    pairs.routes.map((route) => route.vias),
  )
  expect(0.44 - 0.3).toBeLessThan(input.srj.minPadEdgeToPadEdgeClearance)
  expect(0.44 - 0.3).toBeGreaterThan(input.viaClearance!)

  solver.solve()
  expect(solver.solved).toBeTrue()
  expect(solver.failed).toBeFalse()
  await expect(
    renderClearanceRepro(fixture, solver.getOutput()),
  ).toMatchSvgSnapshot(import.meta.path)
})

test.failing("opens the authored foreign pad minimum without changing other copper rules", (): void => {
  const output = solver.getOutput()
  expect(input).toEqual(original)
  expect(output[0]!.route[0]).toEqual(input.routes[0]!.route[0])
  expect(output[0]!.route.at(-1)).toEqual(input.routes[0]!.route.at(-1))
  expect(measureClearanceRepro(fixture, input.routes).drcErrorCount).toBe(1)
  expect(measureClearanceRepro(fixture, output).drcErrorCount).toBe(0)
  expect(output[0]!.vias[0]!.x - 0.5 - 0.15).toBeGreaterThanOrEqual(0.15 - 1e-8)
  expect(
    getNewViaPadViolations({
      srj: input.srj,
      previousRoutes: input.routes,
      routes: input.routes,
      viaClearance: 0.1,
      includeExistingVias: [{ routeIndex: 0, viaIndex: 0 }],
    }),
  ).toHaveLength(1)
  expect(
    createNewViaPadViolationEvaluator({ srj: input.srj, viaClearance: 0.1 })({
      previousRoutes: input.routes,
      routes: input.routes,
      includeExistingVias: [{ routeIndex: 0, viaIndex: 0 }],
    }),
  ).toHaveLength(1)
})
