import { expect, test } from "bun:test"
import {
  createNegotiatedClearanceSearchKernel,
  type NegotiatedClearanceCopper,
} from "../lib/negotiatedClearanceSearchKernel"
import { createNegotiatedClearanceSearchKernel as createReference } from "./fixtures/negotiatedClearanceSearchKernel.reference"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("congestion costs retain frozen zero, single-owner and non-finite numeric behavior", (): void => {
  const edges: Array<[RepairRoutePoint, RepairRoutePoint]> = [
    [{ x: -1, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }],
    [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    [{ x: NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    [{ x: Infinity, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    [
      { x: -Number.MAX_VALUE, y: 0, z: 0 },
      { x: Number.MAX_VALUE, y: 0, z: 0 },
    ],
    [{ x: -0, y: -0, z: 0 }, { x: 0, y: 0, z: 1 }],
  ]
  for (const copperCount of [0, 1, 2]) {
    for (const immutable of [false, true]) {
      for (const owner of ["foreign", "paired-signal"]) {
        for (const weight of [
          0,
          -0,
          -1,
          1,
          Number.MIN_VALUE,
          Infinity,
          -Infinity,
          NaN,
        ]) {
          const task = createPairedClearanceTask("clear")
          task.pathInput.srj.layerCount = 2
          task.coppers = Array.from(
            { length: copperCount },
            (_, index): NegotiatedClearanceCopper => ({
              a: { x: 0, y: -1, z: 0 },
              b: { x: 0, y: 1, z: 0 },
              radius: 0.1,
              minX: 0,
              maxX: 0,
              minY: -1,
              maxY: 1,
              minZ: 0,
              maxZ: 0,
              spanIndex: index,
              owner: index === 0 ? owner : `${owner}_other`,
              index,
              cellX: -1,
              cellY: -2,
              immutable,
            }),
          )
          task.weights = Array.from({ length: copperCount }, (): number => weight)
          const before = structuredClone(task)
          const actual = createNegotiatedClearanceSearchKernel(task)
          const expected = createReference(task)
          for (const [a, b] of edges) {
            expect(actual.query(a, b)).toEqual(expected.query(a, b))
            expect(actual.getAdditionalEdgeCost(a, b)).toBe(
              expected.getAdditionalEdgeCost(a, b),
            )
            expect(actual.getAdditionalEdgeCost(b, a)).toBe(
              expected.getAdditionalEdgeCost(b, a),
            )
          }
          expect(task).toEqual(before)
        }
      }
    }
  }
})
