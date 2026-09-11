# Architecture Decision: Observatory / AI Agent Boundary

Status: accepted
Related: [Issue #7](https://github.com/kajisho5/realtime-media-observatory/issues/7)

## Rule

Realtime Media Observatory exposes **facts only**: measurements, derived
values, and their provenance/confidence. It never concludes, diagnoses, or
recommends.

> network latency: 84ms
> encoder latency: 22ms
> jitter: 8ms
> dropped frames: 17
> clock drift: +0.4ms/s

The Observatory does **not** say:

> "The network is the problem."

That interpretation is the job of a higher-level AI Agent or application
that consumes the Observatory's output:

```
Observatory
    -> Measurements
    -> AI Agent
    -> Interpretation / Diagnosis / Recommendation
```

## Why this matters

It is easy for "helpful" features to creep in over time — a severity badge
here, a "likely cause" field there — until the Observatory quietly becomes
a diagnosis engine. Once that happens in the schema, CLI, or dashboard, the
distinction between "what was measured" and "what someone concluded from
it" is lost, and every downstream consumer (including AI agents) inherits
an opinion it cannot see was ever an opinion.

## Enforcement

This rule applies to every layer: the Common Measurement Model, the
Instrumentation Core, adapters, the CLI/JSON/WebSocket output, and the
dashboard.

Checklist for any PR that touches the Common Measurement Model, CLI/JSON
output, or dashboard:

- [ ] No field encodes a conclusion rather than a measurement (e.g. no
      `root_cause`, `severity_recommendation`, `suggested_fix`, `is_the_problem`,
      or similarly named fields anywhere in the model).
- [ ] Every value that is not directly measured declares its
      `provenance.kind` (`derived` / `estimated` / `inferred`) — see the
      Common Measurement Model (`src/model/types.ts`).
- [ ] UI/CLI copy states numbers, not verdicts ("network latency: 84ms",
      not "network is slow").

## Non-goals

Implementing an actual AI Agent is out of scope for this repository. This
repository's job stops at exposing well-provenanced measurements that such
an agent (or a human) can reason over.
