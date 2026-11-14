import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  prefix?: string;
  className?: string;
  duration?: number;
};

export default function AnimatedNumber({
  value,
  prefix = "",
  className,
  duration = 900,
}: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic — settles smoothly, no bounce
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = display;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {Math.round(display).toLocaleString()}
    </span>
  );
}