import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma || new PrismaClient()

// Reaproveita a mesma instância (e o mesmo pool de conexões) também em produção/serverless
globalForPrisma.prisma = prisma