#!/bin/bash
# Deployment script to run on the droplet after initial setup
# Usage: ./deploy.sh

set -e

cd /var/www/letters-app

echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install --no-audit --prefer-offline

echo "🗄️  Running database migrations..."
npx prisma generate
npx prisma migrate deploy

echo "🏗️  Building application..."
npm run build

echo "🔄 Restarting application..."
pm2 restart letters-app || pm2 start pm2.config.js

echo "✅ Deployment complete!"
pm2 status
