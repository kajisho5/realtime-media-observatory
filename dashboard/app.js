/**
 * Realtime Media Observatory dashboard.
 *
 * A static, dependency-free page: connects to the WebSocket reporting
 * server (`realtime-observe serve` / `realtime-observe dashboard`) and
 * renders the pipeline-first view described in the architecture roadmap —
 * total latency prominent, stage-by-stage latency chain, jitter/drops/
 * XRUN/clock-drift readouts, and the measurement method/confidence for
 * the total latency figure. This page only displays what it's told; it
 * never computes or infers a diagnosis (see docs/architecture/ai-agent-boundary.md).
 */

function wsUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ws") || "ws://localhost:8787";
}

function fmtMs(value) {
  return typeof value === "number" ? `${value.toFixed(1)} ms` : "-- ms";
}

function fmtCount(value) {
  return typeof value === "number" ? String(value) : "--";
}

function render(pipeline) {
  document.getElementById("pipeline-name").textContent = pipeline.name ?? "";
  document.getElementById("total-latency").textContent = fmtMs(pipeline.totalLatencyMeasurement?.value);
  document.getElementById("jitter-inline").textContent = `±${fmtMs(pipeline.jitterMeasurement?.value)} JITTER`.replace("± ", "±");
  document.getElementById("drops-inline").textContent = `${fmtCount(pipeline.dropsMeasurement?.value)} DROPS`;

  document.getElementById("metric-buffer").textContent =
    typeof pipeline.bufferMeasurement?.value === "number" ? `${pipeline.bufferMeasurement.value}%` : "--";
  document.getElementById("metric-jitter").textContent = fmtMs(pipeline.jitterMeasurement?.value);
  document.getElementById("metric-xrun").textContent = fmtCount(pipeline.xrunMeasurement?.value);
  document.getElementById("metric-drift").textContent =
    typeof pipeline.clockDriftMeasurement?.value === "number" ? `${pipeline.clockDriftMeasurement.value.toFixed(2)} ms/s` : "n/a";

  const method = pipeline.totalLatencyMeasurement?.provenance?.method ?? "--";
  const confidence = pipeline.totalLatencyMeasurement?.provenance?.confidence ?? "--";
  document.getElementById("prov-method").textContent = `Measurement: ${String(method).toUpperCase()}`;
  const confidenceEl = document.getElementById("prov-confidence");
  confidenceEl.textContent = `Confidence: ${String(confidence).toUpperCase()}`;
  confidenceEl.className = `confidence confidence-${confidence}`;

  const row = document.getElementById("pipeline-row");
  row.innerHTML = "";
  const stages = pipeline.stages ?? [];
  stages.forEach((stage, index) => {
    const box = document.createElement("div");
    box.className = "stage-box";
    const name = document.createElement("div");
    name.className = "stage-name";
    name.textContent = stage.name.toUpperCase();
    box.appendChild(name);
    row.appendChild(box);

    if (index < stages.length - 1) {
      const latency = stage.measurements?.find((m) => m.name === "latency_ms");
      const edge = document.createElement("div");
      edge.className = "stage-edge";
      edge.textContent = typeof latency?.value === "number" ? latency.value.toFixed(1) : "?";
      row.appendChild(edge);
    }
  });
}

function connect() {
  const url = wsUrlFromQuery();
  const dot = document.getElementById("live-dot");
  const label = document.getElementById("live-label");
  let ws;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    label.textContent = "INVALID WS URL";
    return;
  }

  ws.onopen = () => {
    label.textContent = "LIVE";
    dot.classList.add("live");
  };
  ws.onclose = () => {
    label.textContent = "DISCONNECTED";
    dot.classList.remove("live");
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (event) => {
    try {
      render(JSON.parse(event.data));
    } catch (err) {
      console.error("realtime-media-observatory dashboard: failed to parse message", err);
    }
  };
}

connect();
