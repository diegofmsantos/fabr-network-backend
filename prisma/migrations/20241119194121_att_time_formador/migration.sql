/*
  Warnings:

  - Added the required column `timeFormador` to the `Jogador` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Jogador" ADD COLUMN     "timeFormador" TEXT NOT NULL;
