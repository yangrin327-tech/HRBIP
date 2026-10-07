import { ChevronRight, FileText, Layers, ShieldCheck } from "lucide-react";
import {
  DashboardIllustration,
  ReportIllustration,
  SupportIllustration,
} from "./HomeIllustrations";
import { InquiryForm } from "./InquiryForm";
import { supportTools } from "./SupportTools";
import { Button } from "./ui";
import { useHomePager } from "./useHomePager";
import type { ResultView } from "./SiteNavigation";

export function HomePage({
  onStart,
  onSample,
  onResult,
  onTool,
}: {
  onStart: () => void;
  onSample: () => void;
  onResult: (view: ResultView, sample?: boolean) => void;
  onTool: (id: string) => void;
}) {
  const { viewport } = useHomePager(4);
  return (
    <div className="landing" ref={viewport} aria-label="HRBIP 기능 소개">
      <section
        className="landing-section landing-hero"
        id="intro"
        aria-labelledby="intro-title"
      >
        <div className="landing-inner">
          <div className="landing-copy">
            <h1 id="intro-title" className="landing-brand">
              HRBIP
            </h1>
            <p className="landing-name">HR Business Intelligence Partner</p>
            <h2>인사 데이터가 보고가 되는 순간.</h2>
            <p className="landing-description">
              흩어진 자료를 연결하고,
              {" "}
              대시보드와 보고서를 함께 만드세요.
            </p>
            <p className="landing-scope">인원·입퇴사 · 근태·휴가 · 인건비</p>
            <div className="landing-actions">
              <Button variant="primary" onClick={onStart}>
                대시보드 만들기
              </Button>
              <Button onClick={onSample}>샘플로 체험하기</Button>
            </div>
            <p className="landing-note">
              샘플 체험은 로그인 없이 사용할 수 있어요.
            </p>
          </div>
          <DashboardIllustration />
        </div>
      </section>
      <section
        className="landing-section"
        id="report-intro"
        aria-labelledby="report-title"
      >
        <div className="landing-inner">
          <div className="landing-copy">
            <h2 id="report-title">
              분석한 숫자를
              <br />
              보고할 문서로.
            </h2>
            <p className="landing-description">
              집계 결과로 초안을 작성하고,
              <br />
              회사의 보고 양식에 맞춰 완성하세요.
            </p>
            <ul className="landing-feature-list">
              <li>
                <FileText size={23} />
                PDF·PPT·Excel로 내보내기
              </li>
              <li>
                <Layers size={23} />
                회사 양식 등록과 재사용
              </li>
              <li>
                <ShieldCheck size={23} />
                계산 검증표로 집계 근거 확인
              </li>
            </ul>
            <div className="landing-actions">
              <Button
                variant="primary"
                onClick={() => onResult("report", true)}
              >
                샘플 보고서 열기
              </Button>
              <Button onClick={() => onResult("company")}>
                회사 양식 등록
              </Button>
            </div>
            <button
              className="landing-text-link"
              onClick={() => onResult("verification", true)}
            >
              샘플 계산 검증표 보기 <ChevronRight size={20} />
            </button>
          </div>
          <ReportIllustration />
        </div>
      </section>
      <section
        className="landing-section"
        id="support-intro"
        aria-labelledby="support-title"
      >
        <div className="landing-inner">
          <div className="landing-copy">
            <h2 id="support-title">
              확인이 필요한 업무,
              <br />
              근거부터 꼼꼼하게.
            </h2>
            <p className="landing-description">
              상황에 맞는 도구를 선택하고,
              <br />
              계산 과정과 추가 확인 사항을 살펴보세요.
            </p>
            <div className="landing-support-buttons">
              {supportTools.map(({ id, title, icon: Icon }) => (
                <Button key={id} onClick={() => onTool(id)}>
                  <Icon size={22} aria-hidden="true" />
                  {title}
                  <ChevronRight size={20} className="tool-arrow" />
                </Button>
              ))}
            </div>
          </div>
          <SupportIllustration />
        </div>
      </section>
      <section
        className="landing-section landing-contact"
        id="contact-intro"
        aria-labelledby="contact-title"
      >
        <div className="landing-inner">
          <div className="landing-copy">
            <h2 id="contact-title">
              다음 기능의 시작은,
              <br />
              당신의 업무에서.
            </h2>
            <p className="landing-description">
              사용 중 궁금한 점이나 불편했던 점,
              <br />
              반복해서 하는 인사 업무를 알려주세요.
            </p>
          </div>
          <div className="landing-contact-panel">
            <h3>편하게 남겨주세요.</h3>
            <InquiryForm />
          </div>
        </div>
      </section>
    </div>
  );
}
