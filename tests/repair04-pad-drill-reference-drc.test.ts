import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type DrcEvaluator,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  convertRepairRoutesToTraces,
  getNewViaPadViolations,
} from "../lib"

test("drill relocation honors the caller's stricter electrical context without bypassing pad guards", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [{ x: 0.15, y: 0 }],
      route: [
        { x: 0, y: 0, z: 0, pcb_port_id: "start" },
        { x: 0.15, y: 0, z: 0 },
        { x: 0.15, y: 0, z: 1 },
        { x: 2, y: -2, z: 1, pcb_port_id: "end" },
      ],
    },
  ]
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        shape: "circle",
        center: { x: 0, y: 0 },
        width: 0.4,
        height: 0.4,
        layers: ["top"],
        connectedTo: ["signal", "pcb_smtpad_own"],
      },
    ],
  }
  const electricalContext: SimpleRouteJson = {
    ...srj,
    obstacles: [
      ...srj.obstacles,
      {
        type: "rect",
        center: { x: 0.6, y: 0.3 },
        width: 0.2,
        height: 0.2,
        layers: ["bottom"],
        connectedTo: ["foreign", "pcb_smtpad_external"],
      },
    ],
  }
  const engine = new AutoroutingDrcEngine(electricalContext, {
    traceClearance: 0.2,
    viaClearance: 0.2,
    viaToPadClearance: 0.2,
  })
  const evaluateDrc: DrcEvaluator = ({
    routes: candidate,
  }): ReturnType<DrcEvaluator> => {
    if (!candidate) throw new Error("Expected route geometry")
    return engine.evaluate(
      convertRepairRoutesToTraces(candidate, srj.layerCount),
    )
  }
  expect(
    engine.evaluate(convertRepairRoutesToTraces(routes, 2)).errors,
  ).toEqual([])
  const movableVias = [{ routeIndex: 0, viaIndex: 0 }]
  const solver = new Repair04Solver(
    {
      srj,
      routes,
      bounds: srj.bounds,
      boundaryMargin: 0.01,
      lockedPointIndices: [[true, false, false, true]],
      movableVias,
      padDrillRepair: { holeDiameter: 0.1 },
      maxCandidates: 64,
      maxCandidateAttempts: 64,
    },
    evaluateDrc,
  )
  solver.solve()
  expect(solver.failed).toBe(false)
  const after = solver.getOutput()
  expect(solver.stats.accepted).toBeGreaterThan(0)
  expect(engine.evaluate(convertRepairRoutesToTraces(after, 2)).errors).toEqual(
    [],
  )
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: routes,
      routes: after,
      includeExistingVias: movableVias,
      sameNetViaHoleDiameter: 0.1,
    }),
  ).toEqual([])
  expect(solver.getConstructorParams()[1]).toBe(evaluateDrc)
})
