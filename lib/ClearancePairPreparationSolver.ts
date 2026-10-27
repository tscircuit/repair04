import { BaseSolver, SolverRuntime } from "@tscircuit/solver-utils"
import { areExpandedBoundsSeparated } from "./areExpandedBoundsSeparated"
import { getSegmentToSegmentMinDistance } from "./getSegmentToSegmentMinDistance"

export const CLEARANCE_MAX_DISPLACEMENT = 0.25
export const CLEARANCE_SEGMENT_STRIDE = 8

export type ClearancePairPreparationInput = {
  /** ax, ay, bx, by, minZ, maxZ, radius, net id for each immutable segment. */
  segments: Float64Array
  firstPair: number
  endPair: number
  traceClearance: number
  viaClearance: number
}

/** Read-only pair preparation; triples retain the original pair ordinal. */
export class ClearancePairPreparationSolver extends BaseSolver {
  static readonly solverName = "ClearancePairPreparationSolver"
  private output?: Float64Array

  constructor(private readonly input: ClearancePairPreparationInput) {
    super()
  }

  override _step(): void {
    const { segments, firstPair, endPair, traceClearance, viaClearance } =
      this.input
    const count = segments.length / CLEARANCE_SEGMENT_STRIDE
    if (
      !Number.isInteger(count) ||
      !Number.isSafeInteger(firstPair) ||
      !Number.isSafeInteger(endPair) ||
      firstPair < 0 ||
      endPair < firstPair ||
      endPair > (count * (count - 1)) / 2
    ) {
      throw new Error("repair04: invalid clearance pair preparation range")
    }
    const geometry = Array.from({ length: count }, (_, index) => {
      const offset = index * CLEARANCE_SEGMENT_STRIDE
      const a = { x: segments[offset]!, y: segments[offset + 1]! }
      const b = { x: segments[offset + 2]!, y: segments[offset + 3]! }
      return {
        a,
        b,
        minZ: segments[offset + 4]!,
        maxZ: segments[offset + 5]!,
        radius: segments[offset + 6]!,
        net: segments[offset + 7]!,
        bounds: {
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        },
      }
    })
    let outer = 0
    let rowStart = 0
    while (outer < count && rowStart + count - outer - 1 <= firstPair) {
      rowStart += count - outer - 1
      outer++
    }
    let inner = outer + 1 + firstPair - rowStart
    const pairs: number[] = []
    for (let ordinal = firstPair; ordinal < endPair; ordinal++) {
      if (inner === count) {
        outer++
        inner = outer + 1
      }
      const a = geometry[outer]!
      const b = geometry[inner]!
      if (!(a.net === b.net || a.maxZ < b.minZ || b.maxZ < a.minZ)) {
        const reach =
          a.radius +
          b.radius +
          Math.max(traceClearance, viaClearance) +
          2 * Math.SQRT2 * CLEARANCE_MAX_DISPLACEMENT
        if (
          !areExpandedBoundsSeparated(a.bounds, b.bounds, reach) &&
          getSegmentToSegmentMinDistance(a.a, a.b, b.a, b.b) <= reach
        ) {
          pairs.push(ordinal, outer, inner)
        }
      }
      inner++
    }
    this.output = new Float64Array(pairs)
    this.solved = true
  }

  override getOutput(): Float64Array {
    if (!this.output || !this.solved || this.failed) {
      throw new Error("repair04: clearance pair preparation is incomplete")
    }
    return this.output
  }
}

SolverRuntime.registerSolver(ClearancePairPreparationSolver)
