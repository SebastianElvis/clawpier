interface SparklineProps {
  data: number[];
  max: number;
  color: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  max,
  color,
  width = 64,
  height = 16,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="inline-block align-middle">
        <rect width={width} height={height} rx={2} fill="currentColor" className="text-[var(--bg-active)]" />
      </svg>
    );
  }

  const effectiveMax = max > 0 ? max : 1;
  const padding = 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * innerWidth;
    const y =
      padding + innerHeight - (Math.min(value, effectiveMax) / effectiveMax) * innerHeight;
    return `${x},${y}`;
  });

  // Area fill path (from line down to bottom)
  const firstX = padding;
  const lastX = padding + innerWidth;
  const bottom = height - padding;
  const areaPath = `M${firstX},${bottom} L${points.join(" L")} L${lastX},${bottom} Z`;

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <rect width={width} height={height} rx={2} fill="currentColor" className="text-[var(--bg-hover)]" />
      <path d={areaPath} fill={color} opacity={0.15} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
