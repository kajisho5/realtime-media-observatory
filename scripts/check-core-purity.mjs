#!/usr/bin/env node
/**
 * Core-purity check (Instrumentation Core issue #3 acceptance criterion):
 * fails CI if any concrete external-system identifier leaks into
 * src/core or src/model, which must stay system-agnostic. Adapter-specific
 * code belongs in src/adapter/<system>/ instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const GUARDED_DIRS = ["src/core", "src/model"];
const FORBIDDEN = [
  /\bobs[-_]?websocket\b/i,
  /\bOBSStudio\b/,
  /\bvst3?\b/i,
  /\baudio\s*unit\b/i,
  /\bwebrtc\b/i,
  /\bffmpeg\b/i,
  /\bavformat\b/i,
  /\bcoreaudio\b/i,
  /\bwasapi\b/i,
  /\balsa\b/i,
  /\bjack\b(?!-?son)/i
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) files.push(...walk(full));
    else if (full.endsWith(".ts")) files.push(full);
  }
  return files;
}

let violations = [];
for (const dir of GUARDED_DIRS) {
  let files = [];
  try {
    files = walk(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const isCommentLine = inBlockComment || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**");
      if (trimmed.startsWith("/*")) inBlockComment = true;
      if (trimmed.endsWith("*/")) inBlockComment = false;
      if (isCommentLine) return; // doc comments are allowed to *name* the forbidden systems as a rule statement
      for (const pattern of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${file}:${i + 1}: matched ${pattern} -> ${line.trim()}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Core-purity check failed: system-specific identifiers found in src/core or src/model:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nsrc/core and src/model must stay independent of concrete external systems (OBS, VST, WebRTC, FFmpeg, " +
      "platform audio APIs, ...). Put system-specific code in src/adapter/<system>/ instead."
  );
  process.exit(1);
}

console.log("Core-purity check passed: no system-specific identifiers found in src/core or src/model.");
