import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimplifiedPcbTrace,
} from "high-density-repair03/lib"
import { createViaBlockerFixture } from "./fixtures/createViaBlockerFixture"

const fixedVia = (from: string, to: string): SimplifiedPcbTrace => ({
  type: "pcb_trace",
  pcb_trace_id: "repair04_fixed_0",
  connection_name: "owner",
  route: [
    { route_type: "wire", x: 0, y: 0, layer: from, width: 0.1 },
    {
      route_type: "via",
      x: 0,
      y: 0,
      from_layer: from,
      to_layer: to,
      via_diameter: 0.3,
    },
    { route_type: "wire", x: 0, y: 0, layer: to, width: 0.1 },
  ],
})

test("fixed first-wins and duplicate physical vias cannot claim owned coupling", (): void => {
  const ambiguous: HighDensityRoute = {
    connectionName: "owner",
    rootConnectionName: "owner",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    route: [
      { x: 0, y: -2, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
  }
  for (const options of [
    { fixedTraces: [fixedVia("top", "bottom")] },
    { owner: ambiguous },
  ]) {
    const { solver, selected, candidate } = createViaBlockerFixture(options)
    const route = solver.routes[0]
    const via = solver.getViaGeometry(route)[0]
    expect(solver.getIndexedViaIds(0, route, via).size).toBe(0)
    solver.evaluate = (): never => {
      throw new Error("No extra DRC allowed")
    }
    expect([
      ...solver.generateViaBlockerCandidates(selected, candidate),
    ]).toEqual([])
    expect(solver.viaBlockerPathSearchCalls).toBe(0)
    expect(solver.pathSearchNodes).toBe(0)
  }
  for (const allowBlindAndBuriedVias of [false, true]) {
    // Coincident through vias share copper across the entire stack. The fixed
    // first-wins event remains unowned; disjoint blind spans remain distinct.
    const differentSpan = createViaBlockerFixture({
      layerCount: 4,
      allowBlindAndBuriedVias,
      fixedTraces: [fixedVia("inner2", "bottom")],
    })
    const route = differentSpan.solver.routes[0]
    expect([
      ...differentSpan.solver.getIndexedViaIds(
        0,
        route,
        differentSpan.solver.getViaGeometry(route)[0],
      ),
    ]).toEqual(allowBlindAndBuriedVias ? ["via_1"] : [])
  }
})
