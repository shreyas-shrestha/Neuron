import { useEffect, useRef } from "react";
import * as d3 from "d3";

const GRID = "#3f3f46";
const AXIS = "#a1a1aa";
const LINE = "#818cf8";

export default function LayerTrajectoryChart({ curve, clusters = [], novelFeatures = {} }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !curve) return;
    const el = ref.current;

    const render = () => {
      d3.select(el).selectAll("*").remove();
      const entries = Object.entries(curve).map(([k, v]) => ({ layer: Number(k), value: v }));
      if (!entries.length) return;

      const margin = { top: 16, right: 20, bottom: 32, left: 48 };
      const width = el.getBoundingClientRect().width || 480;
      const height = 280;
      const svg = d3
        .select(el)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("height", height);

      svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#1c1c1f");

      const x = d3
        .scaleLinear()
        .domain(d3.extent(entries, (d) => d.layer))
        .range([margin.left, width - margin.right]);
      const y = d3
        .scaleLinear()
        .domain([0, d3.max(entries, (d) => d.value) * 1.05 || 1])
        .nice()
        .range([height - margin.bottom, margin.top]);

      const xTicks = x.ticks(6);
      const yTicks = y.ticks(4);

      svg
        .append("g")
        .attr("opacity", 0.6)
        .selectAll("line.hgrid")
        .data(yTicks)
        .join("line")
        .attr("class", "hgrid")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", (d) => y(d))
        .attr("y2", (d) => y(d))
        .attr("stroke", GRID)
        .attr("stroke-dasharray", "4 4");

      svg
        .append("g")
        .attr("opacity", 0.6)
        .selectAll("line.vgrid")
        .data(xTicks)
        .join("line")
        .attr("class", "vgrid")
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("x1", (d) => x(d))
        .attr("x2", (d) => x(d))
        .attr("stroke", GRID)
        .attr("stroke-dasharray", "4 4");

      const line = d3
        .line()
        .x((d) => x(d.layer))
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX);

      svg
        .append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
        .call((g) => g.select(".domain").attr("stroke", GRID))
        .call((g) => g.selectAll(".tick line").remove())
        .selectAll("text")
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("font-size", 11)
        .attr("fill", AXIS);

      svg
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(4))
        .call((g) => g.select(".domain").attr("stroke", GRID))
        .call((g) => g.selectAll(".tick line").remove())
        .selectAll("text")
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("font-size", 11)
        .attr("fill", AXIS);

      const path = svg
        .append("path")
        .datum(entries)
        .attr("fill", "none")
        .attr("stroke", LINE)
        .attr("stroke-width", 2)
        .attr("d", line);

      const node = path.node();
      const len = node?.getTotalLength?.() ?? 0;
      if (len > 0) {
        path
          .attr("stroke-dasharray", `${len} ${len}`)
          .attr("stroke-dashoffset", len)
          .transition()
          .duration(600)
          .ease(d3.easeCubicOut)
          .attr("stroke-dashoffset", 0);
      }

      Object.keys(novelFeatures || {}).forEach((layerKey) => {
        const layer = Number(layerKey);
        const nf = novelFeatures[layerKey];
        if (nf && nf.length) {
          const dot = svg
            .append("circle")
            .attr("cx", x(layer))
            .attr("cy", y(entries.find((e) => e.layer === layer)?.value ?? 0))
            .attr("r", 6)
            .attr("fill", "#ef4444")
            .attr("stroke", "#09090b")
            .attr("stroke-width", 2)
            .attr("opacity", 0);
          dot.append("title").text(`Novel features at layer ${layer}`);
          dot.transition().delay(400).duration(200).attr("opacity", 1);
        }
      });

      svg
        .append("text")
        .attr("x", margin.left)
        .attr("y", margin.top - 4)
        .attr("fill", AXIS)
        .attr("font-size", 11)
        .attr("font-family", "JetBrains Mono, monospace")
        .text("‖sparse code‖₂ by layer");
    };

    render();
    const ro = new ResizeObserver(() => render());
    ro.observe(el);
    return () => ro.disconnect();
  }, [curve, clusters, novelFeatures]);

  return <div ref={ref} className="w-full min-h-[200px]" />;
}
