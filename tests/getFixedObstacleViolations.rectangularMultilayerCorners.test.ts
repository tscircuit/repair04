import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { AutoroutingDrcEngine } from "high-density-repair03/lib/drc/AutoroutingDrcEngine"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import {
  createFixedObstacleViolationEvaluator,
  getFixedObstacleViolations as proposedFixed,
} from "../lib/getFixedObstacleViolations"

type Obstacle = SimpleRouteJson["obstacles"][number]
const makeSrj = (obstacle: Obstacle): SimpleRouteJson => ({
  layerCount: 2,
  minTraceWidth: 0.1,
  bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  connections: [],
  obstacles: [obstacle],
})
const square: Obstacle = {
  type: "rect", center: { x: 0, y: 0 }, width: 1.7, height: 1.7,
  layers: ["top", "bottom"], connectedTo: ["pcb_port_foreign"],
}
const corner: HighDensityRoute = {
  connectionName: "signal", rootConnectionName: "signal",
  traceThickness: 0.1, viaDiameter: 0.3, vias: [],
  route: [{ x: 0.9, y: 0.7, z: 0 }, { x: 0.9, y: 0.9, z: 0 }],
}

test("square multilayer SRJ corners are checked without provenance inference", (): void => {
  const srj = makeSrj(square)
  const routes = [corner]
  const before = structuredClone({ srj, routes })
  const engine = new AutoroutingDrcEngine(srj)
  const indexed = engine.evaluate(convertRepairRoutesToTraces(routes, 2))
  expect(indexed.errors).toEqual([])
  const corrected = proposedFixed({ srj, routes })
  expect(corrected).toHaveLength(1)
  expect(corrected[0]!.severity).toBeCloseTo(0.1, 10)
  expect(corrected[0]!.kind).toBe("wire")

  // Missing, unrelated or via provenance cannot alter routing geometry.
  for (const metadata of [
    undefined,
    { pcb_smtpad_id: "pcb_smtpad_foreign" },
    { pcb_plated_hole_id: "unprefixed-opaque-hole" },
    { pcb_via_id: "pcb_via_foreign" },
  ]) {
    const obstacle = { ...square, circuitJsonMetadata: metadata }
    expect(proposedFixed({ srj: makeSrj(obstacle), routes })).toEqual(corrected)
  }
  // Same-net hole aliases on a single-layer SMT slice do not expand scope.
  const slice = {
    ...square, layers: ["top"],
    connectedTo: ["pcb_smtpad_slice", "pcb_plated_hole_same_net_alias"],
  }
  expect(proposedFixed({ srj: makeSrj(slice), routes })).toEqual([])
  expect(proposedFixed({
    srj: makeSrj({ ...square, width: 1.702 }), routes,
  })).toEqual([])
  expect(proposedFixed({
    srj: makeSrj({ ...square, width: 1.7009 }), routes,
  })).toHaveLength(1)
  expect(proposedFixed({
    srj: makeSrj({
      ...square, connectedTo: [...square.connectedTo, "signal"],
    }), routes,
  })).toEqual([])
  const lowerOnly = {
    ...square, layers: ["inner1", "bottom"], zLayers: [1],
  }
  expect(proposedFixed({ srj: makeSrj(lowerOnly), routes })).toEqual([])
  for (const rotation of [35, 90]) {
    const rotatedSrj = makeSrj({ ...square, ccwRotationDegrees: rotation })
    expect(proposedFixed({ srj: rotatedSrj, routes })).toHaveLength(
      rotation === 35 ? 0 : 1,
    )
  }

  // Existing engine contacts remain scored; added rectangle coverage can
  // count the same physical contact in both checks, without removing either.
  const central = {
    ...corner,
    route: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
  }
  expect(new AutoroutingDrcEngine(srj).evaluate(
    convertRepairRoutesToTraces([central], 2),
  ).errors).toHaveLength(1)
  expect(proposedFixed({ srj, routes: [central] })).toHaveLength(1)
  const via = {
    ...corner, vias: [{ x: 1.05, y: 0.9 }],
    route: [{ x: 1.05, y: 0.9, z: 0 }, { x: 1.05, y: 0.9, z: 1 }],
  }
  const viaViolations = proposedFixed({ srj, routes: [via] })
  expect(viaViolations).toHaveLength(1)
  expect(viaViolations[0]!.kind).toBe("via")
  expect(viaViolations[0]!.severity).toBeCloseTo(
    0.25 - Math.hypot(0.2, 0.05), 10,
  )

  const evaluate = createFixedObstacleViolationEvaluator({ srj, routes })
  expect(evaluate(routes)).toEqual(corrected)
  const distant = {
    ...corner,
    route: corner.route.map((point): typeof point => ({
      ...point, x: point.x + 3,
    })),
  }
  expect(evaluate([distant])).toEqual([])
  expect(evaluate(routes)).toEqual(corrected)
  expect({ srj, routes }).toEqual(before)

})
