# DigitalOcean Droplet Deployment Guide

This guide will help you deploy the Voice Messaging App to a DigitalOcean Droplet.

## Prerequisites

- A DigitalOcean account
- A domain name (optional, but recommended)
- SSH access to your droplet

## Step 1: Create a DigitalOcean Droplet

1. Log in to your DigitalOcean dashboard
2. Click "Create" → "Droplets"
3. Choose:
   - **Image**: Ubuntu 22.04 LTS (or latest)
   - **Plan**: Basic plan, at least 1GB RAM ($6/month minimum)
   - **Region**: Choose closest to your users
   - **Authentication**: SSH keys (recommended) or password
4. Click "Create Droplet"

## Step 2: Initial Server Setup

1. SSH into your droplet:
   ```bash
   ssh root@your-droplet-ip
   ```

2. Run the setup script:
   ```bash
   # Clone your repository first (or upload the setup script)
   chmod +x deploy/setup-droplet.sh
   ./deploy/setup-droplet.sh
   ```

   Or manually install:
   ```bash
   # Update system
   apt update && apt upgrade -y
   
   # Install Node.js 20.x
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   
   # Install PostgreSQL
   apt install -y postgresql postgresql-contrib
   
   # Install Nginx
   apt install -y nginx
   
   # Install PM2
   npm install -g pm2
   ```

## Step 3: Set Up PostgreSQL Database

1. Create database and user:
   ```bash
   sudo -u postgres psql
   ```

2. In PostgreSQL prompt:
   ```sql
   CREATE DATABASE voice_messaging;
   CREATE USER voice_app_user WITH ENCRYPTED PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE voice_messaging TO voice_app_user;
   \q
   ```

## Step 4: Clone Your Repository

```bash
cd /var/www
git clone https://github.com/your-username/your-repo-name.git voice-messaging-app
cd voice-messaging-app
```

## Step 5: Configure Environment Variables

1. Create `.env` file:
   ```bash
   cp .env.example .env
   nano .env
   ```

2. Update with production values:
   ```env
   DATABASE_URL="postgresql://voice_app_user:your_password@localhost:5432/voice_messaging?schema=public"
   NEXTAUTH_URL="https://your-domain.com"
   NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
   ```

3. Generate NEXTAUTH_SECRET:
   ```bash
   openssl rand -base64 32
   ```

## Step 6: Install Dependencies and Build

```bash
cd /var/www/voice-messaging-app
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

## Step 7: Set Up PM2

1. Create PM2 config (already in `deploy/pm2.config.js`):
   ```bash
   cp deploy/pm2.config.js pm2.config.js
   ```

2. Start the application:
   ```bash
   pm2 start pm2.config.js
   pm2 save
   pm2 startup
   ```

## Step 8: Configure Nginx

1. Copy Nginx configuration:
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/letters-app
   ```

2. Edit the config:
   ```bash
   sudo nano /etc/nginx/sites-available/letters-app
   ```
   Replace `your-domain.com` with your actual domain.

3. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/letters-app /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Step 9: Set Up SSL with Let's Encrypt (Optional but Recommended)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

This will automatically configure HTTPS and update your Nginx config.

## Step 10: Set Up Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Step 11: Create Uploads Directory

```bash
mkdir -p /var/www/letters-app/public/voice-messages
chmod 755 /var/www/letters-app/public/voice-messages
```

## Future Deployments

For future updates, use the deployment script:

```bash
cd /var/www/voice-messaging-app
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

Or manually:
```bash
cd /var/www/voice-messaging-app
git pull
npm install --production
npx prisma migrate deploy
npm run build
pm2 restart voice-messaging-app
```

## Useful Commands

- View logs: `pm2 logs voice-messaging-app`
- Restart app: `pm2 restart voice-messaging-app`
- Check status: `pm2 status`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- PostgreSQL: `sudo -u postgres psql voice_messaging`

## Troubleshooting

1. **App won't start**: Check PM2 logs with `pm2 logs`
2. **Database connection errors**: Verify DATABASE_URL in .env matches PostgreSQL credentials
3. **502 Bad Gateway**: Ensure the app is running on port 3000: `pm2 status`
4. **File upload issues**: Check directory permissions: `ls -la public/voice-messages`

## Security Notes

- Change default PostgreSQL password
- Use strong NEXTAUTH_SECRET
- Keep system updated: `apt update && apt upgrade`
- Consider setting up fail2ban for SSH protection
- Regularly backup your database
