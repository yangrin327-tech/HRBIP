import { useId, useState } from "react";
import { api } from "./api";
import { Button, Notice } from "./ui";

export function InquiryForm() {
  const id = useId();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inquiry-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || message.trim().length < 5) return;
        setBusy(true);
        setError("");
        setStatus("");
        try {
          const saved = await api("/requests", "POST", { message });
          setStatus(saved.message + " 기록 번호: " + saved.id.slice(0, 8));
          setMessage("");
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={id}>문의 내용 또는 기능 제안</label>
      <textarea
        id={id}
        rows={5}
        minLength={5}
        maxLength={2000}
        required
        disabled={busy}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setStatus("");
        }}
        placeholder="궁금한 점이나 개선했으면 하는 기능을 편하게 적어주세요."
      />
      <p className="inquiry-help">
        5자 이상 작성해 주세요. 이 사이트의 비공개 문의 기록함에 저장돼요.
      </p>
      {status && (
        <div role="status">
          <Notice tone="success">{status}</Notice>
        </div>
      )}
      {error && (
        <Notice tone="error">
          {error} 작성한 내용은 유지돼요. 다시 시도해 주세요.
        </Notice>
      )}
      <Button
        type="submit"
        variant="primary"
        busy={busy}
        disabled={message.trim().length < 5}
      >
        문의·제안 남기기
      </Button>
    </form>
  );
}
