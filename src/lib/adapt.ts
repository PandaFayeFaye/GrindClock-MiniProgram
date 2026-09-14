import type { Employer, TimeEntry } from "./types";
import type { CloudEmployer, CloudTimeEntry } from "./cloud";

// CloudBase documents key their id as `_id`; the ported pay/stats logic
// expects the web app's `{ id, ...fields }` shape. These just relabel the key.
export function toEmployer(doc: CloudEmployer): Employer {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export function toTimeEntry(doc: CloudTimeEntry): TimeEntry {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}
