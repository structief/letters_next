'use client'

export default function LandingWaveform() {
  // Generate 50 bars for the waveform
  const bars = Array.from({ length: 40 }, (_, i) => i)

  return (
    <div className="landing-waveform-container">
      {bars.map((i) => (
        <div
          key={i}
          className="landing-wave-bar"
          style={{
            height: `${Math.random() * 25 + 5}px`,
            animationDelay: `${(i * 0.03) % 2}s`,
            animationDuration: `${Math.random() * 2 + 1.5}s`,
          }}
        />
      ))}
    </div>
  )
}
