import { useEffect, useRef } from "react";
import * as d3 from "d3";

export default function LayerTrajectoryChart({ curve, clusters = [], novelFeatures = {} }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !curve) return;
    const el = ref.current;
    d3.select(el).selectAll("*").remove();
    const entries = Object.entries(curve).map(([k, v]) => ({ layer: Number(k), value: v }));
    if (!entries.length) return;

    const margin = { top: 12, right: 16, bottom: 28, left: 44 };
    const width = el.clientWidth || 480;
    const height = 220;
    const svg = d3
      .select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(entries, (d) => d.layer))
      .range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(entries, (d) => d.value) * 1.05 || 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const line = d3
      .line()
      .x((d) => x(d.layer))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
      .attr("color", "#64748b")
      .selectAll("text")
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 10);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4))
      .attr("color", "#64748b")
      .selectAll("text")
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 10);

    const path = svg
      .append("path")
      .datum(entries)
      .attr("fill", "none")
      .attr("stroke", "#00d4ff")
      .attr("stroke-width", 2)
      .attr("d", line);

    const node = path.node();
    const len = node?.getTotalLength?.() ?? 0;
    if (len > 0) {
      path
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    }

    Object.keys(novelFeatures || {}).forEach((layerKey) => {
      const layer = Number(layerKey);
      const nf = novelFeatures[layerKey];
      if (nf && nf.length) {
        svg
          .append("circle")
          .attr("cx", x(layer))
          .attr("cy", y(entries.find((e) => e.layer === layer)?.value ?? 0))
          .attr("r", 4)
          .attr("fill", "#ef4444")
          .attr("opacity", 0)
          .transition()
          .delay(400)
          .attr("opacity", 0.95);
      }
    });

    svg
      .append("text")
      .attr("x", margin.left)
      .attr("y", margin.top - 2)
      .attr("fill", "#94a3b8")
      .attr("font-size", 11)
      .attr("font-family", "IBM Plex Mono, monospace")
      .text("‖sparse code‖₂ by layer");
  }, [curve, clusters, novelFeatures]);

  return <div ref={ref} className="w-full min-h-[220px]" />;
}
