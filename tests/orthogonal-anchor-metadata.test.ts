import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { findClearancePath } from "../lib/findClearancePath"
import {
  createNegotiatedClearanceSearchKernel,
  type NegotiatedClearanceSearchInput,
} from "../lib/negotiatedClearanceSearchKernel"

test("orthogonal anchor attachments preserve terminal metadata only at exact terminals", (): void => {
  const task = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "./fixtures/rvboy-orthogonal-anchor/input.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString(),
  ) as NegotiatedClearanceSearchInput
  const start = { ...task.pathInput.start, pcb_port_id: "terminal-start" }
  const end = { ...task.pathInput.end, pcb_port_id: "terminal-end" }
  for (const [a, b] of [
    [start, end],
    [end, start],
  ]) {
    const input = {
      ...task.pathInput,
      existingPath: undefined,
      start: a!,
      end: b!,
      getAdditionalEdgeCost:
        createNegotiatedClearanceSearchKernel(task).getAdditionalEdgeCost,
    }
    const solver = new FindClearancePathSolver(input)
    solver.solve()
    expect(solver.solved).toBeTrue()
    for (const path of [solver.getOutput(), findClearancePath(input)]) {
      expect(path).not.toBeNull()
      expect(path![0]).toEqual(a)
      expect(path!.at(-1)).toEqual(b)
      expect(path!.filter((point) => point.pcb_port_id !== undefined)).toEqual([
        a!,
        b!,
      ])
    }
  }
})
