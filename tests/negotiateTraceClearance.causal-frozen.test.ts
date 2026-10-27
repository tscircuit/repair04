import { expect, test } from "bun:test"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import type { NegotiatedClearanceInput, NegotiatedClearanceTaskEvent } from "../lib/negotiateTraceClearance"
import { negotiationInput } from "./fixtures/repair04StepFixtures"

test("a blocker becoming hard forces a victim through the existing path kernel", (): void => {
  const events: NegotiatedClearanceTaskEvent[] = []
  const solver = new NegotiateTraceClearanceSolver({
    ...negotiationInput,
    srj: {
      ...negotiationInput.srj,
      obstacles: [...negotiationInput.srj.obstacles, ...[-0.35, 0.35].map((y): NegotiatedClearanceInput["srj"]["obstacles"][number] => ({
        type: "rect" as const,
        center: { x: -4.5, y },
        width: 0.1,
        height: 0.1,
        layers: ["top"],
        connectedTo: ["foreign"],
      }))],
    },
    useCausalWorklist: true,
    onWorklistTask: (event): void => { events.push(event) },
  })
  solver.solve()
  expect(solver.failed).toBeFalse()
  expect(events.some((event): boolean => event.action === "freeze")).toBeTrue()
  const recheck = events.find((event): boolean => event.action === "recheck-conflict" && event.currentFixedRevision > event.task.fixedRevision)
  expect(recheck).toBeDefined()
  expect(events.some((event): boolean => event.action === "recheck-clear" && event.currentFixedRevision > event.task.fixedRevision)).toBeFalse()
  const result = solver.getOutput()
  expect(result.unresolvedSpanCount).toBeGreaterThan(0)
  expect(result.pathSearchCalls).toBeLessThanOrEqual(negotiationInput.maxPathSearchCalls)
  expect(result.pathSearchNodes).toBeLessThanOrEqual(negotiationInput.maxPathSearchNodes)
})
