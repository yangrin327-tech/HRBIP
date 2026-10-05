import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, AlertCircle, CheckCircle2, Info, LoaderCircle } from "lucide-react";
export function Button({
  children,
  variant = "secondary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={"button " + variant + " " + (props.className || "")}
      disabled={busy || props.disabled}
    >
      {busy && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  const Icon =
    tone === "error" || tone === "warning"
      ? AlertCircle
      : tone === "success"
        ? CheckCircle2
        : Info;
  return (
    <div
      className={"notice " + tone}
      role={tone === "error" ? "alert" : undefined}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    const listener = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener("cancel", listener);
    return () => el?.removeEventListener("cancel", listener);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <Button variant="ghost" aria-label="닫기" onClick={onClose}>
          <X size={21} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="작업 진행 단계">
      {["자료 선택", "데이터 확인", "결과·편집", "최종 확인"].map((x, i) => (
        <li
          key={x}
          className={i === current ? "active" : i < current ? "done" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span>{i < current ? "✓" : i + 1}</span>
          {x}
        </li>
      ))}
    </ol>
  );
}
