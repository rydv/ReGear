import { useEffect, useMemo, useRef, useState } from "react";

export interface CountdownState {
  remainingMs: number;
  label: string;
  isExpired: boolean;
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useReservationCountdown(
  expiresAt: string,
  onExpire: () => void,
): CountdownState {
  const expiresAtMs = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    setNowMs(Date.now());
    hasExpiredRef.current = false;
  }, [expiresAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const isExpired = remainingMs <= 0;

  useEffect(() => {
    if (isExpired && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire();
    }
  }, [isExpired, onExpire]);

  return {
    remainingMs,
    label: formatRemaining(remainingMs),
    isExpired,
  };
}

