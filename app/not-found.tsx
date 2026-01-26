import Link from 'next/link'
import LandingWaveform from '@/components/LandingWaveform'
import AnnouncementBar from '@/components/AnnouncementBar'
import CookieBanner from '@/components/CookieBanner'

export default function NotFound() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="landing-container">
      <AnnouncementBar />
      <div className="landing-content">
        <h1 className="landing-title">404</h1>
        <p className="landing-subtitle">Page not found.<br/><br/>Let&apos;s get you back home.</p>
        <div className="landing-waveform-wrapper">
          <LandingWaveform />
        </div>
        <div className="landing-actions">
          <Link href="/" className="landing-button landing-button-primary">
            Go Home
          </Link>
        </div>
      </div>
      <CookieBanner />
    </div>
  )
}
