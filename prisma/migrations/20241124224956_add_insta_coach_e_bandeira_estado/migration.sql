/*
  Warnings:

  - Added the required column `bandeira_estado` to the `Time` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instagram_coach` to the `Time` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Time" ADD COLUMN     "bandeira_estado" TEXT NOT NULL,
ADD COLUMN     "instagram_coach" TEXT NOT NULL;
