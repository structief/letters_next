#!/bin/bash
# DigitalOcean Droplet Setup Script
# Run this script on a fresh Ubuntu/Debian droplet

set -e

echo "🚀 Setting up Voice Messaging App on DigitalOcean Droplet..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install FFmpeg (for audio duration detection in db:fix-durations script)
echo "📦 Installing FFmpeg..."
sudo apt install -y ffmpeg

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Git if not already installed
echo "📦 Installing Git..."
sudo apt install -y git

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/voice-messaging-app
sudo chown -R $USER:$USER /var/www/voice-messaging-app

# Create PostgreSQL database and user
echo "🗄️  Setting up PostgreSQL database..."
sudo -u postgres psql << EOF
CREATE DATABASE voice_messaging;
CREATE USER voice_app_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE voice_messaging TO voice_app_user;
\q
EOF

echo "✅ Droplet setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository to /var/www/voice-messaging-app"
echo "2. Set up your .env file with production values"
echo "3. Run: npm install"
echo "4. Run: npx prisma migrate deploy"
echo "5. Run: npm run build"
echo "6. Set up PM2 and Nginx (see deploy/nginx.conf and deploy/pm2.config.js)"
echo "7. Start the application with PM2"
echo ""
echo "Post-setup:"
echo "  - Fix legacy audio durations: npm run db:fix-durations -- --dry-run"
