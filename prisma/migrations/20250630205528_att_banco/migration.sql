/*
  Warnings:

  - You are about to drop the column `grupoId` on the `Jogo` table. All the data in the column will be lost.
  - You are about to drop the `ClassificacaoGrupo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Grupo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GrupoTime` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClassificacaoGrupo" DROP CONSTRAINT "ClassificacaoGrupo_grupoId_fkey";

-- DropForeignKey
ALTER TABLE "ClassificacaoGrupo" DROP CONSTRAINT "ClassificacaoGrupo_timeId_fkey";

-- DropForeignKey
ALTER TABLE "Grupo" DROP CONSTRAINT "Grupo_campeonatoId_fkey";

-- DropForeignKey
ALTER TABLE "Grupo" DROP CONSTRAINT "Grupo_regionalId_fkey";

-- DropForeignKey
ALTER TABLE "GrupoTime" DROP CONSTRAINT "GrupoTime_grupoId_fkey";

-- DropForeignKey
ALTER TABLE "GrupoTime" DROP CONSTRAINT "GrupoTime_timeId_fkey";

-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_grupoId_fkey";

-- AlterTable
ALTER TABLE "Jogo" DROP COLUMN "grupoId";

-- DropTable
DROP TABLE "ClassificacaoGrupo";

-- DropTable
DROP TABLE "Grupo";

-- DropTable
DROP TABLE "GrupoTime";
