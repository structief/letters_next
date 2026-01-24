import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Use SQLite adapter for local development (when DATABASE_URL points to a file)
// Use direct connection for PostgreSQL in production
const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db'
const isPostgres = databaseUrl.startsWith('postgresql://')

let prismaClient: PrismaClient

if (isPostgres) {
  // PostgreSQL - use direct connection without adapter
  prismaClient = new PrismaClient()
} else {
  // SQLite - use LibSQL adapter
  const adapter = new PrismaLibSql({ url: databaseUrl })
  prismaClient = new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? prismaClient

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
