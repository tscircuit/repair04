import { expect, test } from "bun:test"
import {
  createNegotiatedClearanceSearchKernel,
  type NegotiatedClearanceCopper,
  type NegotiatedClearanceSearchInput,
} from "../lib/negotiatedClearanceSearchKernel"
import { createNegotiatedClearanceSearchKernel as createReference } from "./fixtures/negotiatedClearanceSearchKernel.reference"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("directional cost kernels preserve frozen query order, costs and borrowed copper", (): void => {
  for (const translation of [-2.5, -1e-9, 0, 1e-9, 2.5]) {
    for (const blindVias of [false, true]) {
      const coppers: NegotiatedClearanceCopper[] = Array.from({ length: 48 }, (_, index) => {
        const x = translation + (index % 8) * 0.3 - 1
        const y = Math.floor(index / 8) * 0.3 - 1
        const via = index % 5 === 0
        const a = { x, y, z: index % 4 }
        const b = via
          ? { x, y, z: (a.z + 1) % 4 }
          : { x: x + 0.7, y: y + (index % 3) * 0.1, z: a.z }
        const radius = via ? 0.15 : 0.05
        return {
          a, b, radius,
          minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
          minZ: via ? 0 : a.z, maxZ: via ? 3 : a.z,
          owner: index % 7 === 0 ? "selected" : `net${index % 6}`,
          spanIndex: index, index,
          cellX: Math.floor(Math.min(a.x, b.x) - radius),
          cellY: Math.floor(Math.min(a.y, b.y) - radius),
          immutable: index % 11 === 0,
        }
      })
      const bounds = { minX: translation - 4, maxX: translation + 4, minY: -4, maxY: 4 }
      const start = { x: translation - 3, y: -3, z: 0 }
      const end = { x: translation + 3, y: 3, z: 0 }
      const task: NegotiatedClearanceSearchInput = {
        selectedOwner: "selected", coppers,
        weights: coppers.map((_, index) => 1 + index / 8),
        pathInput: {
          srj: { bounds, layerCount: 4, minTraceWidth: 0.1, connections: [], obstacles: [], allowBlindAndBuriedVias: blindVias },
          routes: [{ connectionName: "selected", traceThickness: 0.1, viaDiameter: 0.3, vias: [], route: [start, end] }],
          routeIndex: 0, start, end, bounds, traceThickness: 0.1,
          traceClearance: 0.1, viaClearance: 0.1, viaHoleDiameter: 0.2,
        },
      }
      const before = structuredClone(task)
      const reference = createReference(task)
      const actual = createNegotiatedClearanceSearchKernel(task)
      const edges: Array<[RepairRoutePoint, RepairRoutePoint]> = [[start, end]]
      for (let index = 0; index < 180; index++) {
        const a = { x: translation - 2 + (index % 30) * 0.15, y: -1 + Math.floor(index / 30) * 0.3, z: index % 4 }
        const b = index % 3 === 0
          ? { ...a, z: (a.z + 1) % 4 }
          : { x: a.x + 0.1, y: a.y + (index % 2) * 0.1, z: a.z }
        edges.push([a, b], [b, a])
      }
      for (const coordinate of [2 ** 53, -(2 ** 53), 1e20, -1e20]) {
        edges.push([{ x: coordinate, y: 0, z: 0 }, { x: coordinate, y: 0.1, z: 0 }])
        edges.push([{ x: 0, y: coordinate, z: 0 }, { x: 0.1, y: coordinate, z: 0 }])
      }
      for (const [a, b] of edges) {
        expect(actual.query(a, b)).toEqual(reference.query(a, b))
        expect(actual.getAdditionalEdgeCost(a, b)).toBe(reference.getAdditionalEdgeCost(a, b))
      }
      expect(task).toEqual(before)
    }
  }
})
