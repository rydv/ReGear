import { useReservationCountdown } from "../hooks/useReservationCountdown";

interface ReservationCountdownProps {
  expiresAt: string;
  onExpire: () => void;
}

export function ReservationCountdown({
  expiresAt,
  onExpire,
}: ReservationCountdownProps) {
  const countdown = useReservationCountdown(expiresAt, onExpire);

  return (
    <span className="countdown" aria-live="polite">
      {countdown.isExpired ? "00:00" : countdown.label}
    </span>
  );
}

