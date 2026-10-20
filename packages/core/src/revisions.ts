import { ServiceError } from "./errors.js";

export function assertExpectedRevision(current: number, expected: number): void {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new ServiceError("validation", "expectedRevision must be a positive integer.");
  }
  if (current !== expected) {
    throw new ServiceError("conflict", "The record changed since it was loaded.", {
      currentRevision: current,
      expectedRevision: expected,
    });
  }
}
