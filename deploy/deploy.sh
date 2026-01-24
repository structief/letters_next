#!/bin/bash
# Deployment script to run on the droplet after initial setup
# Usage: ./deploy.sh

set -e

cd /var/www/voice-messaging-app

echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install --production

echo "🗄️  Running database migrations..."
npx prisma generate
npx prisma migrate deploy

echo "🏗️  Building application..."
npm run build

echo "🔄 Restarting application..."
pm2 restart voice-messaging-app || pm2 start pm2.config.js

echo "✅ Deployment complete!"
pm2 status
