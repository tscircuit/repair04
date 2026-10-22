import { expect, test } from "bun:test"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test(
  "a generation charges both lanes before throwing the forward error",
  (): void => {
    const paired = new PairedClearancePathSolver({
      task: createPairedClearanceTask("wall", 2_000),
      reverseMaxNodes: 384,
    })
    while (!paired.reverse?.isSearchPrepared()) {
      paired.step()
      if (paired.solved || paired.failed) {
        throw new Error("Expected both lanes to reach the search phase")
      }
    }
    const reverse = paired.reverse
    const prefixNodes = paired.stats.nodesPopped
    const forwardError = new TypeError("forward-generation-error")
    const reverseError = new RangeError("reverse-generation-error")
    const visited: string[] = []
    paired.forward._step = (): void => {
      visited.push("forward")
      paired.forward.stats.nodesPopped += 11
      throw forwardError
    }
    reverse._step = (): void => {
      visited.push("reverse")
      reverse.stats.nodesPopped = 7
      throw reverseError
    }
    expect(() => paired.step()).toThrow(forwardError)
    expect(visited).toEqual(["forward", "reverse"])
    expect(paired.stats.nodesPopped).toBe(prefixNodes + 18)
    expect(
      paired.getLaneStats().map((stats): number => stats.nodesPopped),
    ).toEqual([prefixNodes + 11, 7])
    expect(paired.getLastLaneErrors()).toEqual([
      { name: "TypeError", message: "forward-generation-error" },
      { name: "RangeError", message: "reverse-generation-error" },
    ])
  },
)
