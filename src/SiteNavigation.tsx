import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supportTools } from "./SupportTools";

export type ResultView = "dashboard" | "report" | "company" | "verification";

export function SiteNavigation({
  onStart,
  onSample,
  onSaved,
  onTool,
  onResult,
  onRequest,
}: {
  onStart: () => void;
  onSample: () => void;
  onSaved: () => void;
  onTool: (id: string) => void;
  onResult: (view: ResultView) => void;
  onRequest: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const groups = [
    {
      id: "reports",
      title: "인사현황 분석·보고",
      items: [
        {
          title: "대시보드 만들기",
          text: "자료 업로드 → 확인 → 대시보드·보고서 생성",
          run: onStart,
        },
        {
          title: "샘플로 체험하기",
          text: "가상 데이터로 결과 먼저 살펴보기",
          run: onSample,
        },
        {
          title: "저장한 작업",
          text: "작업·보고서·템플릿 이어서 열기",
          run: onSaved,
        },
        {
          title: "회사 양식 등록",
          text: "PPT·Excel 양식을 보고서에 적용",
          run: () => onResult("company"),
        },
        {
          title: "계산 검증표",
          text: "집계값과 독립 검산 결과 비교",
          run: () => onResult("verification"),
        },
        {
          title: "보고서 편집",
          text: "초안에 담당자 설명과 의견 추가",
          run: () => onResult("report"),
        },
      ],
    },
    {
      id: "support",
      title: "인사 실무 도구",
      items: supportTools.map((t) => ({
        title: t.title,
        text: t.description,
        run: () => onTool(t.id),
      })),
    },
    {
      id: "contact",
      title: "문의·기능 제안",
      items: [
        {
          title: "사용 중 문의·기능 요청",
          text: "불편한 점과 필요한 기능 알려주기",
          run: onRequest,
        },
      ],
    },
  ];
  return (
    <nav
      className="site-nav"
      aria-label="주요 기능"
      ref={ref}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(null);
      }}
    >
      {groups.map((group) => (
        <div
          className="site-nav-group"
          key={group.id}
          onMouseEnter={() => {
            if (matchMedia("(hover:hover)").matches) setOpen(group.id);
          }}
          onMouseLeave={() =>
            setOpen((current) => (current === group.id ? null : current))
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(null);
              e.currentTarget
                .querySelector<HTMLButtonElement>(".site-nav-trigger")
                ?.focus();
            }
          }}
        >
          <button
            className="site-nav-trigger"
            aria-expanded={open === group.id}
            aria-controls={`site-menu-${group.id}`}
            onClick={(e) =>
              setOpen((current) =>
                e.detail > 0 && matchMedia("(hover:hover)").matches
                  ? group.id
                  : current === group.id
                    ? null
                    : group.id,
              )
            }
          >
            {group.title}
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          <div
            className="site-nav-dropdown"
            id={`site-menu-${group.id}`}
            hidden={open !== group.id}
          >
            {group.items.map((item) => (
              <button
                key={item.title}
                onClick={() => {
                  setOpen(null);
                  item.run();
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
