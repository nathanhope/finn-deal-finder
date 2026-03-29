import { useEffect, useRef } from 'react'

const RADIUS = 28
const CIRCUMFERENCE = 2 * Math.PI * RADIUS // ≈ 175.9

function getColor(score) {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

export default function ScoreRing({ score, size = 72 }) {
  const circleRef = useRef(null)

  const target = score != null ? Math.min(Math.max(score, 0), 100) : 0
  const dashOffset = CIRCUMFERENCE * (1 - target / 100)
  const color = score != null ? getColor(score) : '#3a3a3a'
  const fontSize = size < 60 ? 11 : 13

  useEffect(() => {
    const el = circleRef.current
    if (!el || score == null) return
    // Start from empty, animate to filled
    el.style.strokeDashoffset = CIRCUMFERENCE
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        el.style.strokeDashoffset = dashOffset
      })
    })
  }, [score, dashOffset])

  const center = size / 2
  const scale = size / 72

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS * scale}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={4 * scale}
        />
        {/* Progress */}
        <circle
          ref={circleRef}
          cx={center}
          cy={center}
          r={RADIUS * scale}
          fill="none"
          stroke={color}
          strokeWidth={4 * scale}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE * scale}
          strokeDashoffset={CIRCUMFERENCE * scale}
        />
      </svg>
      {/* Score label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ color }}
      >
        {score != null ? (
          <>
            <span className="mono font-bold leading-none" style={{ fontSize: fontSize * scale + 4 }}>
              {score}
            </span>
            <span className="text-[#9a9080] leading-none" style={{ fontSize: 8 * scale }}>
              /100
            </span>
          </>
        ) : (
          <span className="text-[#3a3a3a]" style={{ fontSize: 9 * scale }}>N/A</span>
        )}
      </div>
    </div>
  )
}
