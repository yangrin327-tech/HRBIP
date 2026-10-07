import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { Chart, Card, Design } from "../shared/model";
import { formatValue } from "../shared/analytics";
const themes = {
  green: ["#166b4c", "#6f8b2f", "#517d99", "#ba994a", "#728274"],
  forest: ["#234a3c", "#719582", "#baa570", "#5c7693", "#9a765d"],
  lime: ["#527a1d", "#6f8b2f", "#517d99", "#ba994a", "#7b7288"],
};
export function DataChart({
  chart,
  card,
  theme,
  onSelect,
  brand,
}: {
  chart: Chart;
  card: Card;
  theme: Design["theme"];
  onSelect?: (value: string) => void;
  brand?: Design["brand"];
}) {
  const colors = brand
      ? [brand.color, ...themes[theme].slice(1)]
      : themes[theme],
    data = chart.points,
    select = (entry: any) => {
      const label = entry?.payload?.label ?? entry?.label;
      if (onSelect && typeof label === "string") onSelect(label);
    };
  const formatter = (value: unknown) =>
    formatValue(typeof value === "number" ? value : null, chart.unit);
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e6ebe3" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 16, fill: "#3a413d" }}
        tickLine={false}
        axisLine={false}
        minTickGap={16}
      />
      <YAxis
        width={88}
        tick={{ fontSize: 16, fill: "#3a413d" }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v) =>
          Math.abs(v) >= 1000000
            ? (v / 1000000).toLocaleString() + "백만"
            : v.toLocaleString()
        }
      />
      <Tooltip
        formatter={formatter}
        contentStyle={{
          border: "1px solid #d5e2d4",
          borderRadius: 12,
          fontSize: 16,
        }}
      />
      <Legend
        iconType="circle"
        wrapperStyle={{ fontSize: 16, paddingTop: 12 }}
      />
    </>
  );
  const safeType = chart.allowed.includes(card.type)
    ? card.type
    : chart.recommended;
  let visual;
  if (safeType === "table")
    visual = <ChartTable chart={chart} onSelect={onSelect} />;
  else if (safeType === "pie")
    visual = (
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.filter((p) => p.value !== null)}
              dataKey="value"
              nameKey="label"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={2}
              onClick={select}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              {data.map((p, i) => (
                <Cell key={p.label} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={formatter} />
            <Legend wrapperStyle={{ fontSize: 16 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  else if (safeType === "horizontal")
    visual = (
      <div
        className="chart-canvas"
        style={{ height: Math.max(255, Math.min(data.length, 16) * 32) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 5, right: 30, bottom: 5, top: 5 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 5"
              stroke="#e6ebe3"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 16 }}
              tickFormatter={(v) =>
                Math.abs(v) >= 1000000 ? v / 1000000 + "백만" : v
              }
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={94}
              tick={{ fontSize: 16, fill: "#3a413d" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={formatter} />
            <Bar
              dataKey="value"
              name={chart.series[0]}
              fill={colors[0]}
              radius={[0, 4, 4, 0]}
              maxBarSize={23}
              onClick={select}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  else
    visual = (
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          {safeType === "line" ? (
            <LineChart
              data={data}
              margin={{ right: 18, top: 12, left: 0, bottom: 0 }}
            >
              {axes}
              {chart.series.map((name, i) => (
                <Line
                  key={name}
                  dataKey={i === 0 ? "value" : "value2"}
                  name={name}
                  type="linear"
                  stroke={colors[i]}
                  strokeWidth={3}
                  connectNulls={false}
                  dot={(props: any) => (
                    <circle
                      key={props.key}
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill={colors[i]}
                      onClick={() => select(props)}
                      style={{ cursor: onSelect ? "pointer" : "default" }}
                    />
                  )}
                  activeDot={(props: any) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={6}
                      fill={colors[i]}
                      onClick={() => select(props)}
                      style={{ cursor: onSelect ? "pointer" : "default" }}
                    />
                  )}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart
              data={data}
              margin={{ right: 18, top: 12, left: 0, bottom: 0 }}
            >
              {axes}
              {chart.series.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={i === 0 ? "value" : "value2"}
                  name={name}
                  fill={colors[i]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  onClick={select}
                  isAnimationActive={false}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  return (
    <>
      {visual}
      {safeType !== "table" && (
        <details className="chart-table">
          <summary>상세 수치{onSelect ? " · 항목 선택" : ""}</summary>
          <ChartTable chart={chart} onSelect={onSelect} />
        </details>
      )}
    </>
  );
}
function ChartTable({
  chart,
  onSelect,
}: {
  chart: Chart;
  onSelect?: (label: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>기간 / 범주</th>
            {chart.series.map((s) => (
              <th key={s}>
                {s} ({chart.unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.points.map((p) => (
            <tr key={p.label}>
              <td>
                {onSelect ? (
                  <button
                    className="text-button"
                    onClick={() => onSelect(p.label)}
                  >
                    {p.label} 선택
                  </button>
                ) : (
                  p.label
                )}
              </td>
              <td>{formatValue(p.value)}</td>
              {chart.series.length > 1 && (
                <td>{formatValue(p.value2 ?? null)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
