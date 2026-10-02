/**
 * Read a newline-delimited JSON response body, calling `onEvent` for each line
 * as soon as it arrives. Resolves when the stream ends. Rejects with an
 * AbortError if `signal` aborts, or with an Error on network failure.
 *
 * Malformed lines are skipped (and reported to `onParseError` if given) so one
 * bad line never kills a long stream.
 */
export async function readNdjson<T>(
  response: Response,
  onEvent: (event: T) => void,
  opts: { signal?: AbortSignal; onParseError?: (line: string, error: unknown) => void } = {},
): Promise<void> {
  if (!response.body) throw new Error("Response has no body to stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => {
    reader.cancel().catch(() => {});
  };
  opts.signal?.addEventListener("abort", abort, { once: true });

  const emit = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: T;
    try {
      parsed = JSON.parse(trimmed) as T;
    } catch (e) {
      opts.onParseError?.(trimmed, e);
      return;
    }
    onEvent(parsed);
  };

  try {
    while (true) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        emit(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    emit(buffer);
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
