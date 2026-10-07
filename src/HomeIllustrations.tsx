import { useId } from "react";

const ink = "#2f5f51",
  mint = "#84bca4",
  gold = "#d5bb77",
  line = "#dde7e1",
  quiet = "#e9eeeb";
function TextLines({
  x,
  y,
  widths,
  gap = 22,
}: {
  x: number;
  y: number;
  widths: number[];
  gap?: number;
}) {
  return (
    <>
      {widths.map((width, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * gap}
          width={width}
          height={9}
          rx={3}
          fill={quiet}
        />
      ))}
    </>
  );
}
export function DashboardIllustration({
  compact = false,
}: {
  compact?: boolean;
}) {
  const title = useId();
  return (
    <figure className="home-art dashboard-art">
      <svg viewBox="0 0 760 650" role="img" aria-labelledby={title}>
        <title id={title}>
          지표 카드와 추이·막대·구성비 차트가 함께 있는 대시보드 구성 예시
        </title>
        <rect
          x="24"
          y="86"
          width="608"
          height="542"
          rx="25"
          fill="#ffffff88"
          stroke="#fff"
        />
        <TextLines x={44} y={115} widths={[170, 100, 135]} />
        <rect
          x="74"
          y="34"
          width="650"
          height="566"
          rx="24"
          fill="#fff"
          stroke="#d5e1d9"
        />
        <rect x="74" y="34" width="650" height="62" rx="24" fill="#e8f2ec" />
        <rect x="74" y="72" width="650" height="24" fill="#e8f2ec" />
        <circle cx="101" cy="65" r="6" fill={ink} />
        <circle cx="121" cy="65" r="6" fill={mint} />
        <circle cx="141" cy="65" r="6" fill={gold} />
        <rect x="555" y="57" width="138" height="16" rx="5" fill="#c7dbce" />
        {[106, 307, 508].map((x, i) => (
          <g key={x}>
            <rect
              x={x}
              y="118"
              width="184"
              height="84"
              rx="10"
              fill={i === 0 ? "#eef6f0" : "#f7f9f7"}
            />
            <rect
              x={x + 16}
              y="136"
              width="75"
              height="8"
              rx="3"
              fill="#cddad1"
            />
            <rect
              x={x + 16}
              y="159"
              width={i === 2 ? 62 : 45}
              height="23"
              rx="4"
              fill={i === 0 ? ink : "#b2c9ba"}
            />
            <rect
              x={x + 102}
              y="171"
              width="54"
              height="7"
              rx="3"
              fill="#d1dfd5"
            />
          </g>
        ))}
        <rect
          x="106"
          y="220"
          width="586"
          height="176"
          rx="9"
          fill="#fff"
          stroke={line}
        />
        <TextLines x={122} y={239} widths={[120]} />
        {[280, 321, 362].map((y) => (
          <line
            key={y}
            x1="128"
            x2="670"
            y1={y}
            y2={y}
            stroke={line}
            strokeDasharray="3 5"
          />
        ))}
        <path
          d={
            compact
              ? "M142 343 L230 324 L316 331 L402 282 L488 293 L574 268 L658 278"
              : "M142 345 L230 313 L316 328 L402 282 L488 304 L574 274 L658 258"
          }
          fill="none"
          stroke={ink}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {[142, 230, 316, 402, 488, 574, 658].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={
              (compact
                ? [343, 324, 331, 282, 293, 268, 278]
                : [345, 313, 328, 282, 304, 274, 258])[i]
            }
            r="5"
            fill={ink}
          />
        ))}
        <rect
          x="106"
          y="412"
          width="339"
          height="157"
          rx="9"
          fill="#fff"
          stroke={line}
        />
        <TextLines x={122} y={430} widths={[118]} />
        {[44, 70, 55, 90, 79, 108].map((h, i) => (
          <rect
            key={i}
            x={132 + i * 47}
            y={550 - h}
            width="26"
            height={h}
            rx="3"
            fill={[mint, ink, gold][i % 3]}
          />
        ))}
        <rect
          x="461"
          y="412"
          width="231"
          height="157"
          rx="9"
          fill="#fff"
          stroke={line}
        />
        <circle
          cx="524"
          cy="490"
          r="39"
          fill="none"
          stroke={line}
          strokeWidth="19"
        />
        <circle
          cx="524"
          cy="490"
          r="39"
          fill="none"
          stroke={ink}
          strokeWidth="19"
          strokeDasharray="125 245"
          transform="rotate(-90 524 490)"
        />
        <circle
          cx="524"
          cy="490"
          r="39"
          fill="none"
          stroke={gold}
          strokeWidth="19"
          strokeDasharray="64 245"
          strokeDashoffset="-125"
          transform="rotate(-90 524 490)"
        />
        <TextLines x={584} y={461} widths={[85, 64, 75, 50]} gap={23} />
        <rect x="609" y="374" width="135" height="53" rx="10" fill={ink} />
        <circle cx="628" cy="394" r="5" fill={mint} />
        <rect x="641" y="389" width="79" height="8" rx="3" fill="#ffffffb0" />
        <rect x="641" y="406" width="45" height="6" rx="2" fill="#ffffff70" />
      </svg>
    </figure>
  );
}
export function ReportIllustration() {
  const title = useId();
  return (
    <figure className="home-art report-art">
      <svg viewBox="0 0 760 650" role="img" aria-labelledby={title}>
        <title id={title}>
          요약 문장·차트와 계산 대조표가 함께 있는 보고서 구성 예시
        </title>
        <rect
          x="103"
          y="44"
          width="524"
          height="566"
          rx="22"
          fill="#fff"
          stroke={line}
        />
        <rect x="137" y="77" width="261" height="16" rx="4" fill={ink} />
        <TextLines x={137} y={118} widths={[220, 196, 232, 158]} />
        <rect
          x="412"
          y="117"
          width="179"
          height="138"
          rx="8"
          fill="#fafcfb"
          stroke={line}
        />
        {[44, 78, 57, 99].map((h, i) => (
          <rect
            key={i}
            x={431 + i * 37}
            y={235 - h}
            width="23"
            height={h}
            rx="3"
            fill={[mint, ink, gold, ink][i]}
          />
        ))}
        <line x1="137" x2="591" y1="281" y2="281" stroke={line} />
        <TextLines x={137} y={311} widths={[236, 204, 227, 173, 219]} />
        <rect
          x="413"
          y="306"
          width="178"
          height="146"
          rx="8"
          fill="#fff"
          stroke={line}
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect
              x="427"
              y={321 + i * 24}
              width="70"
              height="11"
              rx="3"
              fill="#dce9df"
            />
            <rect
              x="507"
              y={321 + i * 24}
              width="67"
              height="11"
              rx="3"
              fill={i === 4 ? mint : quiet}
            />
          </g>
        ))}
        <rect x="137" y="489" width="454" height="75" rx="8" fill="#edf5f0" />
        <TextLines x={155} y={508} widths={[356, 315]} />
        <rect
          x="42"
          y="501"
          width="251"
          height="94"
          rx="14"
          fill="#fff"
          stroke={line}
        />
        <circle cx="73" cy="532" r="11" fill={ink} />
        <path d="m67 532 4 4 9-10" fill="none" stroke="#fff" strokeWidth="3" />
        <TextLines x={96} y={527} widths={[156, 123]} />
      </svg>
    </figure>
  );
}
export function SupportIllustration() {
  const title = useId();
  return (
    <figure className="home-art">
      <svg viewBox="0 0 760 650" role="img" aria-labelledby={title}>
        <title id={title}>
          입력 내용을 확인하고 근거와 검토 항목을 정리하는 인사 실무 도구 구성
          예시
        </title>
        <rect
          x="136"
          y="74"
          width="511"
          height="506"
          rx="23"
          fill="#fff"
          stroke={line}
        />
        <rect x="164" y="108" width="236" height="16" rx="4" fill={ink} />
        <TextLines x={164} y={153} widths={[428, 391, 410]} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x="164"
              y={245 + i * 83}
              width="452"
              height="65"
              rx="10"
              fill={i === 1 ? "#edf5f0" : "#f7f9f7"}
            />
            <circle
              cx="195"
              cy={278 + i * 83}
              r="13"
              fill={i === 1 ? ink : mint}
            />
            <path
              d={`m188 ${278 + i * 83} 5 5 11-12`}
              stroke="#fff"
              strokeWidth="3"
              fill="none"
            />
            <TextLines x={224} y={266 + i * 83} widths={[291, 241]} gap={20} />
          </g>
        ))}
        <rect x="450" y="521" width="166" height="32" rx="6" fill={ink} />
        <rect
          x="65"
          y="440"
          width="184"
          height="139"
          rx="16"
          fill="#fff"
          stroke={line}
        />
        <path
          d="M96 469h58l19 19v58H96z"
          fill="#e7f2eb"
          stroke={mint}
          strokeWidth="2"
        />
        <TextLines x={110} y={491} widths={[41, 32]} gap={18} />
        <circle cx="181" cy="532" r="17" fill={ink} />
        <path
          d="m173 532 6 6 12-14"
          stroke="#fff"
          strokeWidth="3"
          fill="none"
        />
      </svg>
    </figure>
  );
}
