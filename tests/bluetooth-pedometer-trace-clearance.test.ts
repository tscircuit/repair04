import { expect, test } from "bun:test"
import "bun-match-svg"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getSvgFromGraphicsObject } from "graphics-debug"
import fixtureData from "./fixtures/clearance-repros/bluetooth-pedometer-trace-clearance.json"
import {
  getClearanceReproGraphics,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"
import { runClearanceVisualRepro } from "./fixtures/runClearanceVisualRepro"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

function tracePairGap(a: HighDensityRoute, b: HighDensityRoute): number {
  let gap = Infinity
  for (let ai = 1; ai < a.route.length; ai++) {
    const a0 = a.route[ai - 1]! as RepairRoutePoint
    const a1 = a.route[ai]! as RepairRoutePoint
    if (a0.z !== a1.z) continue
    for (let bi = 1; bi < b.route.length; bi++) {
      const b0 = b.route[bi - 1]! as RepairRoutePoint
      const b1 = b.route[bi]! as RepairRoutePoint
      if (b0.z !== b1.z || a0.z !== b0.z) continue
      gap = Math.min(
        gap,
        segmentToSegmentMinDistance(a0, a1, b0, b1) -
          Math.max(a0.traceThickness ?? a.traceThickness, a1.traceThickness ?? a.traceThickness) / 2 -
          Math.max(b0.traceThickness ?? b.traceThickness, b1.traceThickness ?? b.traceThickness) / 2,
      )
    }
  }
  return gap
}

test("real Bluetooth pedometer exposes the ignored wire-pair rule in repair", async (): Promise<void> => {
  // The fixture retains the complete 4-layer board and 165 automatic routes.
  // Only route representation changes: wires/vias become HD route vertices.
  // Source URL, source commit, and autorouter commit are recorded in the fixture.
  const fixture = structuredClone(fixtureData) as ClearanceVisualReproFixture
  const original = structuredClone(fixture.input)
  const output = runClearanceVisualRepro(fixture)
  const before = fixtureData.tracePairs.map(([a, b]) =>
    tracePairGap(original.routes[a!]!, original.routes[b!]!),
  )
  const after = fixtureData.tracePairs.map(([a, b]) =>
    tracePairGap(output[a!]!, output[b!]!),
  )
  // Match the checker tolerance: a gap below 0.095 mm violates the 0.1 mm rule.
  expect(before.filter((gap) => gap < 0.095)).toHaveLength(9)
  expect(after.filter((gap) => gap < 0.095)).toHaveLength(9)
  expect(fixture.input).toEqual(original)
  for (const [routeIndex, route] of output.entries()) {
    for (const [pointIndex, locked] of original.lockedPointIndices[routeIndex]!.entries()) {
      if (locked) expect(route.route[pointIndex]).toEqual(original.routes[routeIndex]!.route[pointIndex])
    }
  }
  for (const [view, viewport] of [
    ["board", fixture.viewport],
    ["charger", { minX: -7.5, maxX: -3.5, minY: 5.4, maxY: 9.8 }],
  ] as const) {
    const graphics = getClearanceReproGraphics({ ...fixture, viewport }, output)
    graphics.texts!.push({
      x: 550,
      y: 556,
      text: `Requested 0.1 mm wire gaps: ${before.filter((gap) => gap < 0.095).length} before / ${after.filter((gap) => gap < 0.095).length} after`,
      fontSize: 13,
      color: "#b91c1c",
    })
    await expect(
      getSvgFromGraphicsObject(graphics, { backgroundColor: "white" }),
    ).toMatchSvgSnapshot(import.meta.path, view)
  }
})
