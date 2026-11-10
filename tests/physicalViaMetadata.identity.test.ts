import { expect, test } from "bun:test"
import type { RelaxTraceClearanceInput, Repair04SolverInput } from "../lib"

import { getRepairRouteVias } from "../lib/getRepairRouteVias"
import {
  getPhysicalViaAt,
  preserveProjectedVias,
  type PhysicalHighDensityRoute,
  type PhysicalHighDensityVia,
} from "../lib/physicalViaMetadata"

type Assert<T extends true> = T
type ProjectionVia = RelaxTraceClearanceInput["routes"][number]["vias"][number]
type TopologyVia = Repair04SolverInput["routes"][number]["vias"][number]
export type ProjectionHasViaDimensions = Assert<
  "outerDiameter" extends keyof ProjectionVia ? true : false
>
export type ViaCopperDiameterHasNoAlias = Assert<
  "diameter" extends keyof PhysicalHighDensityVia ? false : true
>
export type TopologyUsesLegacyViaShape = Assert<
  "outerDiameter" extends keyof TopologyVia ? false : true
>

const routeWith = (
  route: PhysicalHighDensityRoute["route"],
  vias: PhysicalHighDensityRoute["vias"],
): PhysicalHighDensityRoute => ({
  connectionName: "signal",
  traceThickness: 0.1,
  viaDiameter: 0.2,
  route,
  vias,
})

test("projection moves each record with its transition and copies metadata verbatim", () => {
  const source = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    [{ x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.3 }],
  )
  const before = structuredClone(source)
  const next = {
    ...source,
    route: source.route.map((point) => ({ ...point, x: 1 })),
  }
  expect(preserveProjectedVias(next, source)).toEqual([
    { x: 1, y: 0, outerDiameter: 0.8, holeDiameter: 0.3 },
  ])
  // Projection must not alias or mutate the input records.
  const output = preserveProjectedVias(next, source)
  expect(output[0]).not.toBe(source.vias[0])
  expect(source).toEqual(before)
})

test("unprovable transitions keep records and positions instead of failing", () => {
  const fixed = routeWith(
    [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    [{ x: -1, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 }],
  )
  // A boundary via without any layer transition inside the fragment.
  expect(
    preserveProjectedVias(
      { ...fixed, route: fixed.route.map((point) => ({ ...point, x: 2 })) },
      fixed,
    ),
  ).toEqual(fixed.vias)
  // A changed point count cannot prove transition identity.
  expect(
    preserveProjectedVias(
      {
        ...fixed,
        route: [...fixed.route, { x: 2, y: 0, z: 0 }],
      },
      fixed,
    ),
  ).toEqual(fixed.vias)
  // A changed layer sequence cannot prove transition identity either.
  expect(
    preserveProjectedVias(
      {
        ...fixed,
        route: [
          { x: -1, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
      },
      fixed,
    ),
  ).toEqual(fixed.vias)
})

test("a removed layer transition drops its record but keeps boundary vias", () => {
  const source = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    [
      { x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 },
      // Fixed boundary via: no layer transition anywhere in the fragment.
      { x: 3, y: 0, outerDiameter: 0.6 },
    ],
  )
  // The cross-layer detour is gone and the route is planar again.
  const planar = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    source.vias,
  )
  expect(preserveProjectedVias(planar, source)).toEqual([
    { x: 3, y: 0, outerDiameter: 0.6 },
  ])
})

test("a diagonal cross-layer segment is not a via and drops its record", () => {
  const source = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    [{ x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 }],
  )
  const diagonal = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    source.vias,
  )
  expect(preserveProjectedVias(diagonal, source)).toEqual([])
})

test("several destinations for one position keep the record in place", () => {
  const source = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    [{ x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 }],
  )
  // Three transitions leave the same source position, each to a different
  // destination; none of them proves where the record belongs.
  const next = routeWith(
    [
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -2, z: 0 },
      { x: 0, y: -2, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -3, z: 0 },
      { x: 0, y: -3, z: 1 },
    ],
    source.vias,
  )
  expect(preserveProjectedVias(next, source)).toEqual(source.vias)
})

test("records merge only when position and physical dimensions are identical", () => {
  const stacked = routeWith(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
    ],
    [
      { x: 0, y: 0, outerDiameter: 0.8 },
      { x: 0, y: 0, outerDiameter: 0.8 },
    ],
  )
  const moved = {
    ...stacked,
    route: stacked.route.map((point) => ({ ...point, x: 1 })),
  }
  expect(preserveProjectedVias(moved, stacked)).toEqual([
    { x: 1, y: 0, outerDiameter: 0.8 },
  ])

  const differing = routeWith(stacked.route, [
    { x: 0, y: 0, outerDiameter: 0.8 },
    { x: 0, y: 0, outerDiameter: 0.6 },
  ])
  expect(preserveProjectedVias({ ...differing, vias: [] }, differing)).toEqual([
    { x: 0, y: 0, outerDiameter: 0.8 },
    { x: 0, y: 0, outerDiameter: 0.6 },
  ])
})

test("coincident records compare parsed dimensions, not raw field presence", () => {
  const route = {
    ...routeWith([], []),
    viaDiameter: 0.8,
  }
  const withExplicitCopper = {
    ...route,
    vias: [
      { x: 0, y: 0, outerDiameter: 0.8, holeDiameter: 0.4 },
      { x: 0, y: 0, holeDiameter: 0.4 },
    ],
  }
  expect(getPhysicalViaAt(withExplicitCopper, { x: 0, y: 0 })).toEqual({
    x: 0,
    y: 0,
    outerDiameter: 0.8,
    holeDiameter: 0.4,
  })
  expect(() =>
    getPhysicalViaAt(
      {
        ...withExplicitCopper,
        vias: [
          ...withExplicitCopper.vias,
          { x: 0, y: 0, outerDiameter: 0.7, holeDiameter: 0.4 },
        ],
      },
      { x: 0, y: 0 },
    ),
  ).toThrow("conflicting coincident")
  expect(() =>
    getPhysicalViaAt(
      {
        ...route,
        vias: [{ x: 0, y: 0, outerDiameter: 0.3, holeDiameter: 0.4 }],
      },
      { x: 0, y: 0 },
    ),
  ).toThrow("invalid physical via dimensions")
})

test("crop keeps fixed collar metadata and labels new transitions as unknown", () => {
  const source = routeWith(
    [
      { x: 0.5, y: 5, z: 0 },
      { x: 2.5, y: 5, z: 0 },
      { x: 2.5, y: 5, z: 1 },
      { x: 5, y: 5, z: 1 },
    ],
    [
      { x: 0.5, y: 5, outerDiameter: 0.8, holeDiameter: 0.4 },
      { x: 2.5, y: 5 },
    ],
  )
  expect(
    getRepairRouteVias({
      route: source,
      mutableBounds: { minX: 1, minY: 1, maxX: 9, maxY: 9 },
    }),
  ).toEqual([
    { x: 0.5, y: 5, outerDiameter: 0.8, holeDiameter: 0.4 },
    { x: 2.5, y: 5 },
  ])
  expect(
    getRepairRouteVias({
      route: {
        ...source,
        route: [
          { x: 1.5, y: 5, z: 0 },
          { x: 1.5, y: 5, z: 1 },
          { x: 3, y: 5, z: 1 },
        ],
        vias: [],
      },
      mutableBounds: { minX: 1, minY: 1, maxX: 9, maxY: 9 },
    }),
  ).toEqual([{ x: 1.5, y: 5 }])
})
