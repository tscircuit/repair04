import { expect, test } from "bun:test"
import type { AutoroutingDrcError } from "high-density-repair03/lib"
import { preservesDrcClearances } from "../lib/preservesDrcClearances"

test("a drill repair cannot trade a removed error for a new or worsened contact", (): void => {
  const contact: AutoroutingDrcError = {
    type: "pcb_trace_error",
    error_type: "pcb_trace_error",
    pcb_trace_error_id: "residual",
    message: "existing contact",
    actual_clearance: 0.02,
    minimum_clearance: 0.1,
  }
  const before = [contact, { ...contact, pcb_trace_error_id: "removed" }]
  expect(preservesDrcClearances({ before, after: [contact] })).toBe(true)
  for (const after of [
    [{ ...contact, pcb_trace_error_id: "new" }],
    [{ ...contact, actual_clearance: 0.01 }],
    [{ ...contact, actual_clearance: undefined }],
    [{ ...contact, minimum_clearance: 0.11 }],
    before,
  ]) {
    expect(preservesDrcClearances({ before, after })).toBe(false)
  }
})
