export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function responseError(res: Response) {
  const data = await res.json().catch(() => null);
  return new ApiError(
    data?.error ||
      (res.status === 413
        ? "전송 가능한 크기를 초과했습니다."
        : "서버 요청에 실패했습니다. 잠시 후 다시 시도하세요."),
    res.status,
  );
}

async function request(path: string, method: string, body?: unknown) {
  if (method === "GET") return fetch("/api" + path);
  const json = JSON.stringify(body ?? {}),
    bytes = new TextEncoder().encode(json);
  if (bytes.length < 3 * 1024 * 1024)
    return fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: json,
    });
  const start = await fetch("/api/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/api" + path, bytes: bytes.length }),
  });
  if (!start.ok) throw await responseError(start);
  const { token, chunkSize } = await start.json();
  const headers = {
    "Content-Type": "application/json",
    "X-HRBIP-Upload": token,
  };
  try {
    for (
      let offset = 0, index = 0;
      offset < bytes.length;
      offset += chunkSize, index++
    ) {
      const part = bytes.subarray(offset, offset + chunkSize);
      let binary = "";
      for (let i = 0; i < part.length; i += 8192)
        binary += String.fromCharCode(...part.subarray(i, i + 8192));
      const res = await fetch("/api/transfers/part", {
        method: "POST",
        headers,
        body: JSON.stringify({ index, data: btoa(binary) }),
      });
      if (!res.ok) throw await responseError(res);
    }
    return await fetch("/api" + path, { method, headers, body: "{}" });
  } finally {
    await fetch("/api/transfers", {
      method: "DELETE",
      headers,
      body: "{}",
    }).catch(() => {});
  }
}

export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await request(path, method, body);
  if (!res.ok) throw await responseError(res);
  return res.json();
}
export async function download(path: string, body: unknown, name: string) {
  const res = await request(path, "POST", body);
  if (!res.ok) throw await responseError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
