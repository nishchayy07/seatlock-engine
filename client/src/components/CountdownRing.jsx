/**
 * CountdownRing – SVG circular progress timer.
 * Props:
 *   ms       – remaining milliseconds
 *   totalMs  – total milliseconds (for % calculation)
 *   size     – diameter in px (default 120)
 *   stroke   – ring thickness in px (default 6)
 */
export default function CountdownRing({ ms, totalMs, size = 120, stroke = 6 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, ms / totalMs));
  const dashOffset = circumference * (1 - progress);

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  // Color transitions: green → amber → red
  let ringColor, textColor;
  if (progress > 0.5) {
    ringColor = "#34d399"; // emerald
    textColor = "#6ee7b7";
  } else if (progress > 0.2) {
    ringColor = "#fbbf24"; // amber
    textColor = "#fde68a";
  } else {
    ringColor = "#f87171"; // red
    textColor = "#fca5a5";
  }

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
        />
      </svg>

      {/* Time text in center */}
      <div
        className="absolute flex flex-col items-center"
        style={{ color: textColor }}
      >
        <span className="font-display text-2xl font-black tracking-wider leading-none">
          {minutes}:{seconds}
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.3em] opacity-60">
          hold
        </span>
      </div>
    </div>
  );
}
