"use client";

import type { YearlyFundingDatum } from "@/shared/contracts/dashboard-data";
import ReactECharts from "echarts-for-react";
import { cn, formatUsdMillions } from "@/lib/utils";

type ChartDatum = {
  label: string;
  value: number;
};

type BarChartCardProps = {
  title: string;
  data: ChartDatum[];
  color: string;
  onSelect?: (label: string) => void;
};

export function BarChartCard({ title, data, color, onSelect }: BarChartCardProps) {
  const option = {
    grid: { top: 12, right: 20, bottom: 20, left: 122 },
    tooltip: {
      trigger: "axis",
      formatter: (items: Array<{ name: string; value: number }>) => {
        const item = items[0];
        return `${item.name}<br/>${formatUsdMillions(item.value)}`;
      }
    },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.label).reverse(),
      axisLabel: { width: 116, overflow: "truncate" }
    },
    series: [
      {
        type: "bar",
        data: data.map((item) => item.value).reverse(),
        itemStyle: { color, borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ReactECharts
        option={option}
        style={{ height: 260 }}
        onEvents={{
          click: (event: { name?: string }) => {
            if (event.name && onSelect) onSelect(event.name);
          }
        }}
      />
    </section>
  );
}

export function TrendChartCard({
  data,
  aggregateData
}: {
  data: YearlyFundingDatum[];
  aggregateData?: YearlyFundingDatum[];
}) {
  const xLabels = data.map((item) => item.yearLabel);
  const aggregateLabels = aggregateData?.map((item) => item.yearLabel) ?? [];
  const option = {
    grid: { top: 20, right: 20, bottom: 26, left: 60 },
    tooltip: {
      trigger: "axis",
      formatter: (items: Array<{ name: string; value: number }>) => {
        const item = items[0];
        return `${item.name}<br/>${formatUsdMillions(item.value)}`;
      }
    },
    xAxis: { type: "category", data: [...xLabels, ...aggregateLabels] },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { fontSize: 11 }
    },
    series: [
      {
        name: "Yearly funding",
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: "#2364aa" },
        itemStyle: { color: "#2364aa" },
        areaStyle: { color: "rgba(35, 100, 170, 0.12)" },
        data: [...data.map((item) => item.totalFunding), ...Array(aggregateLabels.length).fill(null)]
      },
      ...(aggregateData?.length
        ? [
            {
              name: "Aggregate label",
              type: "scatter",
              symbolSize: 10,
              itemStyle: { color: "#e76f51" },
              data: [
                ...Array(xLabels.length).fill(null),
                ...aggregateData.map((item) => item.totalFunding)
              ]
            }
          ]
        : [])
    ]
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Yearly Funding Trend
        </h2>
        <span className={cn("rounded-full bg-panel px-2 py-1 text-xs text-slate-600")}>
          2020-2023 aggregate is shown separately
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} />
    </section>
  );
}

export function CauseMarkerCard({
  data
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const option = {
    grid: { top: 16, right: 12, bottom: 20, left: 140 },
    tooltip: {
      trigger: "axis",
      formatter: (items: Array<{ name: string; value: number }>) => {
        const item = items[0];
        return `${item.name}<br/>${formatUsdMillions(item.value)}`;
      }
    },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.label).reverse(),
      axisLabel: { width: 130, overflow: "truncate" }
    },
    series: [
      {
        type: "bar",
        data: data.map((item) => item.value).reverse(),
        itemStyle: { color: "#7c3aed", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cause Marker Comparison
        </h2>
      </div>
      <ReactECharts option={option} style={{ height: 250 }} />
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Cause categories overlap. Do not add these bars together as total funding.
      </p>
    </section>
  );
}
