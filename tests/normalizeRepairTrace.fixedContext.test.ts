import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type SimplifiedPcbTrace,
} from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { normalizeRepairTrace } from "../lib/normalizeRepairTrace"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("normalizes fixed via wire endpoints so both clipped copper spans remain visible to DRC", () => {
  const input = regionSafetyFixture()
  const trace: SimplifiedPcbTrace = {
    type: "pcb_trace",
    pcb_trace_id: "fixed-via",
    connection_name: "fixed-net",
    route: [
      {
        route_type: "wire",
        x: -1000,
        y: 0,
        layer: "top",
        width: 0.2,
        start_pcb_port_id: "fixed-start",
      },
      {
        route_type: "via",
        x: 0,
        y: 0,
        from_layer: "top",
        to_layer: "bottom",
        via_diameter: 0.3,
      },
      {
        route_type: "wire",
        x: 1000,
        y: 0,
        layer: "bottom",
        width: 0.4,
        end_pcb_port_id: "fixed-end",
      },
    ],
  }
  const before = structuredClone(trace)
  const normalized = normalizeRepairTrace(trace, 0.2)
  expect(normalized.route.slice(1, 4)).toEqual([
    { route_type: "wire", x: 0, y: 0, layer: "top", width: 0.2 },
    trace.route[1]!,
    { route_type: "wire", x: 0, y: 0, layer: "bottom", width: 0.4 },
  ])
  input.srj.traces = [trace]
  const region = extractRepairRegion(input)
  const fixed = region.srj.traces![0]!
  expect(fixed.route).toHaveLength(5)
  expect((fixed.route[0] as { x: number }).x).toBeCloseTo(
    region.contextBounds.minX,
    10,
  )
  expect((fixed.route.at(-1) as { x: number }).x).toBeCloseTo(
    region.contextBounds.maxX,
    10,
  )
  expect(trace).toEqual(before)
  const crossing: SimplifiedPcbTrace = {
    type: "pcb_trace",
    pcb_trace_id: "crossing",
    connection_name: "different-net",
    route: [
      { route_type: "wire", x: 2, y: -1, layer: "bottom", width: 0.2 },
      { route_type: "wire", x: 2, y: 1, layer: "bottom", width: 0.2 },
    ],
  }
  expect(
    new AutoroutingDrcEngine(region.srj).evaluate([fixed, crossing]).errors
      .length,
  ).toBeGreaterThan(0)
})
