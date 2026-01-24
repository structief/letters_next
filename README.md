# Lttrs. - Voice Messaging App

A mobile-first voice messaging application built with Next.js, TypeScript, and Prisma.

## Features

- User authentication (login/register)
- Voice message recording and playback
- Real-time conversation threads
- Mobile-optimized UI
- File storage for voice messages

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```
   
   Update `NEXTAUTH_SECRET` with a random string (you can generate one with `openssl rand -base64 32`)

3. **Set up the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. Register a new account or login
2. View your conversations (initially empty)
3. To start a conversation, you'll need to search for users (feature can be extended)
4. Click on a conversation thread to play voice messages
5. Hold the record button to record and send a voice message

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Prisma** - Database ORM
- **SQLite** - Database (can be switched to PostgreSQL)
- **NextAuth.js** - Authentication
- **Tailwind CSS** - Styling (with custom CSS for the original design)

## Project Structure

```
├── app/
│   ├── api/          # API routes
│   ├── app/          # Main app pages (protected)
│   ├── login/        # Login page
│   └── register/     # Register page
├── components/       # React components
├── lib/              # Utilities (Prisma, Auth)
├── prisma/           # Database schema
└── public/           # Static files and voice messages
```

## Notes

- Voice messages are stored in `public/voice-messages/`
- The app uses SQLite by default for easy setup
- For production, consider using PostgreSQL and a proper file storage service (S3, etc.)
- The UI is optimized for mobile devices (max-width: 400px)
