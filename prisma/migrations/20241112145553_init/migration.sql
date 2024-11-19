-- CreateTable
CREATE TABLE "Time" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "fundacao" TEXT NOT NULL,
    "instagram" TEXT NOT NULL,
    "instagram2" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "capacete" TEXT NOT NULL,
    "titulos" JSONB NOT NULL,
    "estadio" TEXT NOT NULL,
    "presidente" TEXT NOT NULL,
    "head_coach" TEXT NOT NULL,
    "coord_ofen" TEXT NOT NULL,
    "coord_defen" TEXT NOT NULL,
    "brasileirao" BOOLEAN NOT NULL,

    CONSTRAINT "Time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jogador" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "timeId" INTEGER NOT NULL,
    "posicao" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "experiencia" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "idade" INTEGER NOT NULL,
    "altura" DOUBLE PRECISION NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "instagram" TEXT NOT NULL,
    "instagram2" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "nacionalidade" TEXT NOT NULL,
    "camisa" TEXT NOT NULL,
    "estatisticas" JSONB NOT NULL,

    CONSTRAINT "Jogador_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Jogador" ADD CONSTRAINT "Jogador_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
