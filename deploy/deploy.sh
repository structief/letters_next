#!/bin/bash
# Deployment script to run on the droplet after initial setup
# Usage: ./deploy.sh

set -e

cd /var/www/letters-app

echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
# Clear npm cache to free memory
npm cache clean --force 2>/dev/null || true
# Install with minimal memory footprint
npm install --no-audit --prefer-offline --no-optional --legacy-peer-deps

echo "🗄️  Running database migrations..."
npx prisma generate
npx prisma migrate deploy

echo "🏗️  Building application..."
npm run build

echo "🔄 Restarting application..."
pm2 restart letters-app || pm2 start pm2.config.js

echo "✅ Deployment complete!"
pm2 status
