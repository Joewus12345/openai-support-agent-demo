"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const description = "An interactive area chart";

export type ChartAreaPoint = Record<string, string | number> & { date: string };

const defaultChartData: ChartAreaPoint[] = [
  { date: "2024-06-01", jobs: 12, updates: 4 },
  { date: "2024-06-02", jobs: 10, updates: 2 },
  { date: "2024-06-03", jobs: 14, updates: 5 },
  { date: "2024-06-04", jobs: 11, updates: 3 },
  { date: "2024-06-05", jobs: 9, updates: 6 },
  { date: "2024-06-06", jobs: 8, updates: 4 },
  { date: "2024-06-07", jobs: 15, updates: 7 },
];

const defaultConfig = {
  jobs: {
    label: "Jobs processed",
    color: "var(--primary)",
  },
  updates: {
    label: "Knowledge base updates",
    color: "var(--chart-2, #60a5fa)",
  },
} satisfies ChartConfig;

type RangeOption = "90d" | "30d" | "7d";

export function ChartAreaInteractive({
  data = defaultChartData,
  config = defaultConfig,
  title = "Activity overview",
  description: subtitle = "Scrape jobs and knowledge base updates",
  defaultRange = "90d",
  referenceDate,
}: {
  data?: ChartAreaPoint[];
  config?: ChartConfig;
  title?: string;
  description?: string;
  defaultRange?: RangeOption;
  referenceDate?: string;
}) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<RangeOption>(defaultRange);

  const resolvedConfig = React.useMemo(() => {
    const entries = Object.entries(config).map(([key, value]) => [
      key,
      {
        ...value,
        color: value?.color ?? "var(--primary)",
      },
    ]);

    return Object.fromEntries(entries) as ChartConfig;
  }, [config]);

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const filteredData = React.useMemo(() => {
    const latest = referenceDate
      ? new Date(referenceDate)
      : data.length
      ? new Date(data[data.length - 1].date)
      : new Date();

    const daysToSubtract = timeRange === "30d" ? 30 : timeRange === "7d" ? 7 : 90;
    const startDate = new Date(latest);
    startDate.setDate(startDate.getDate() - daysToSubtract);

    return data.filter((item) => {
      const date = new Date(item.date);
      return date >= startDate;
    });
  }, [data, timeRange, referenceDate]);

  const seriesKeys = React.useMemo(
    () => Object.keys(resolvedConfig).filter((key) => key !== "visitors"),
    [resolvedConfig]
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">{subtitle}</span>
          <span className="@[540px]/card:hidden">{subtitle}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={resolvedConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              {seriesKeys.map((key) => {
                const color = (resolvedConfig[key] as { color?: string })?.color ?? "var(--primary)";
                return (
                  <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.9} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              defaultIndex={isMobile ? -1 : 10}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            {seriesKeys.map((key) => {
              const color = (resolvedConfig[key] as { color?: string })?.color ?? "var(--primary)";
              return (
                <Area
                  key={key}
                  dataKey={key}
                  type="natural"
                  fill={`url(#fill-${key})`}
                  stroke={color}
                  stackId="a"
                />
              );
            })}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
