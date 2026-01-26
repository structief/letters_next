'use client'

import { useState, useEffect } from 'react'

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if user has already accepted cookies
    const cookieConsent = localStorage.getItem('cookieConsent')
    if (!cookieConsent) {
      setIsVisible(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <p className="cookie-banner-text">
          We use cookies to keep you signed in once you do. By continuing, you agree to our use of cookies. That&apos;s it. No tracking. No data collection.
        </p>
        <button onClick={handleAccept} className="cookie-banner-button">
          Accept
        </button>
      </div>
    </div>
  )
}
