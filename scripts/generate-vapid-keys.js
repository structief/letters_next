#!/usr/bin/env node

/**
 * Generate VAPID keys for web push notifications
 * 
 * Usage:
 *   node scripts/generate-vapid-keys.js
 * 
 * This will output the public and private keys that should be added to your .env file:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-key>
 *   VAPID_PRIVATE_KEY=<private-key>
 *   VAPID_EMAIL=mailto:your-email@example.com
 */

const webpush = require('web-push')

try {
  const vapidKeys = webpush.generateVAPIDKeys()

  console.log('\n=== VAPID Keys Generated ===\n')
  console.log('Add these to your .env file:\n')
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
  console.log(`VAPID_EMAIL=mailto:your-email@example.com\n`)
  console.log('Note: Replace "your-email@example.com" with your actual email address.\n')
} catch (error) {
  console.error('Error generating VAPID keys:', error)
  process.exit(1)
}
