import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { findClearancePath } from "../lib/findClearancePath"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("a surface trace clears a default via whose electrical transition uses other layers", (): void => {
  const wire = makeBudgetRoute("wire", [
    [-2, 0],
    [2, 0],
  ])
  for (const point of wire.route) point.z = 3
  const via = makeBudgetRoute("via", [
    [0, 0],
    [0, 0],
  ])
  via.route[1]!.z = 1
  via.vias = [{ x: 0, y: 0 }]
  const { srj, bounds } = makeBudgetInput([wire, via])
  srj.layerCount = 4
  const input = {
    srj,
    bounds,
    routes: [wire, via],
    routeIndex: 0,
    start: wire.route[0]!,
    end: wire.route[1]!,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
    existingPath: wire.route,
  }
  const path = findClearancePath(input)
  expect(path).not.toBeNull()
  const center = { x: 0, y: 0 }
  for (let i = 1; i < path!.length; i++) {
    expect(
      segmentToSegmentMinDistance(path![i - 1]!, path![i]!, center, center),
    ).toBeGreaterThanOrEqual(0.3 - 1e-8)
  }
  Object.assign(srj, { allowBlindAndBuriedVias: true })
  expect(findClearancePath(input)).toEqual(wire.route)
})
