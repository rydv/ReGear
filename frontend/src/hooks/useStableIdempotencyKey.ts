import { useCallback, useRef } from "react";

function createIdempotencyKey(scope: string): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${scope}-${randomPart}`;
}

export function useStableIdempotencyKey(scope: string) {
  const keysRef = useRef<Map<string, string>>(new Map());

  const getKey = useCallback(
    (resourceId: string) => {
      const existing = keysRef.current.get(resourceId);
      if (existing) {
        return existing;
      }

      const nextKey = createIdempotencyKey(scope);
      keysRef.current.set(resourceId, nextKey);
      return nextKey;
    },
    [scope],
  );

  const clearKey = useCallback((resourceId: string) => {
    keysRef.current.delete(resourceId);
  }, []);

  return { getKey, clearKey };
}

