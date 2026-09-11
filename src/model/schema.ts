/**
 * JSON Schema for the Common Measurement Model. This is the machine-readable
 * contract that `realtime-observe --json` output (and any future adapter/
 * dashboard/AI-agent payload) must validate against.
 */
export const CMM_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://realtime-media-observatory/schema/pipeline.json",
  title: "Pipeline",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "stages", "generatedAt"],
  properties: {
    schemaVersion: { type: "string" },
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    generatedAt: { type: "string", format: "date-time" },
    totalLatencyMeasurement: { $ref: "#/definitions/measurement" },
    jitterMeasurement: { $ref: "#/definitions/measurement" },
    clockDriftMeasurement: { $ref: "#/definitions/measurement" },
    dropsMeasurement: { $ref: "#/definitions/measurement" },
    xrunMeasurement: { $ref: "#/definitions/measurement" },
    bufferMeasurement: { $ref: "#/definitions/measurement" },
    stages: {
      type: "array",
      items: { $ref: "#/definitions/stage" }
    }
  },
  definitions: {
    stage: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "measurements"],
      properties: {
        id: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        measurements: {
          type: "array",
          items: { $ref: "#/definitions/measurement" }
        }
      }
    },
    measurement: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "value", "unit", "provenance"],
      properties: {
        id: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        value: { type: "number" },
        unit: { type: "string", minLength: 1 },
        provenance: { $ref: "#/definitions/provenance" },
        timestamp: { $ref: "#/definitions/timestamp" }
      }
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "method", "confidence"],
      properties: {
        kind: { type: "string", enum: ["measured", "derived", "estimated", "inferred"] },
        method: { type: "string", minLength: 1 },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        sourceIds: { type: "array", items: { type: "string" } }
      }
    },
    timestamp: {
      type: "object",
      additionalProperties: false,
      required: ["clock", "valueMs"],
      properties: {
        clock: { $ref: "#/definitions/clockRef" },
        valueMs: { type: "number" }
      }
    },
    clockRef: {
      type: "object",
      additionalProperties: false,
      required: ["domain", "id"],
      properties: {
        domain: {
          type: "string",
          enum: [
            "monotonic",
            "wall",
            "media_timestamp",
            "capture_timestamp",
            "presentation_timestamp",
            "source_clock",
            "destination_clock"
          ]
        },
        id: { type: "string", minLength: 1 }
      }
    }
  }
} as const;
