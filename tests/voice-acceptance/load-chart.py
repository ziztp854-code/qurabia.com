"""Render measured local HTTP load latencies; never issues network requests."""

import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

with open(sys.argv[1], encoding="utf-8") as evidence:
    result = json.load(evidence)

phases = list(result["summary"])
positions = list(range(len(phases)))
figure, axis = plt.subplots(figsize=(9, 4.5), layout="constrained")
for offset, metric, label, color in [
    (-0.25, "p50Ms", "p50", "#1864ab"),
    (0, "p95Ms", "p95", "#f08c00"),
    (0.25, "maxMs", "Maximum", "#495057"),
]:
    bars = axis.bar(
        [position + offset for position in positions],
        [result["summary"][phase][metric] for phase in phases],
        width=0.24,
        label=label,
        color=color,
    )
    axis.bar_label(bars, fmt="%.0f", fontsize=8, padding=3)

axis.set_xticks(positions, ["Join", "HTTP session recovery", "Idempotent rejoin", "Leave"])
axis.set_ylabel("Measured operation duration (ms)")
axis.set_title("Loopback application + isolated PostgreSQL: 4 actors × 5 cycles")
axis.set_ylim(0, max(s["maxMs"] for s in result["summary"].values()) * 1.2)
axis.legend(ncols=3, loc="upper left")
axis.spines[["top", "right"]].set_visible(False)
axis.grid(axis="y", alpha=0.15)
axis.set_axisbelow(True)
figure.text(
    0.5,
    -0.02,
    "20 samples per phase; 0 errors. Warm development server; no media or physical devices measured.",
    ha="center",
    fontsize=8,
)
figure.savefig(sys.argv[2], bbox_inches="tight")
