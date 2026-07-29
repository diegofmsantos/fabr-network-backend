-- AlterTable
ALTER TABLE "Materia" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "Materia_tipo_createdAt_idx" ON "Materia"("tipo", "createdAt");
