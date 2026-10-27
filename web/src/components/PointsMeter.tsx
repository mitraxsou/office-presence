import { DaysMeter, HoursFyiRow } from "@/components/op/DesignKit";

/** @deprecated Prefer DaysMeter from DesignKit; kept for existing imports. */
export function PointsMeter({ points, target }: { points: number; target: number }) {
  return <DaysMeter current={points} target={target} />;
}

/** FYI only: hours never gate days and there is no fail state. */
export function HoursFyi({ hours, advised }: { hours: number; advised: number }) {
  return <HoursFyiRow hours={hours} advised={advised} />;
}
