import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { CMM_JSON_SCHEMA } from "./schema.js";
import type { Pipeline } from "./types.js";

let cachedValidator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!cachedValidator) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    cachedValidator = ajv.compile(CMM_JSON_SCHEMA);
  }
  return cachedValidator;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Validates an arbitrary JSON value against the CMM Pipeline schema. */
export function validatePipeline(data: unknown): ValidationResult {
  const validate = getValidator();
  const valid = validate(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  return { valid: false, errors };
}

/** Throws if the pipeline does not validate against the CMM schema. */
export function assertValidPipeline(data: unknown): asserts data is Pipeline {
  const result = validatePipeline(data);
  if (!result.valid) {
    throw new Error(`Pipeline failed CMM schema validation:\n${result.errors.join("\n")}`);
  }
}
