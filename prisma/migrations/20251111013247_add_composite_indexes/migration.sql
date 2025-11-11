-- CreateIndex
CREATE INDEX "Campeonato_temporada_isSuperliga_status_idx" ON "Campeonato"("temporada", "isSuperliga", "status");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_campeonatoId_temporada_conferenciaId_idx" ON "DistribuicaoTime"("campeonatoId", "temporada", "conferenciaId");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_regionalId_temporada_idx" ON "DistribuicaoTime"("regionalId", "temporada");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_temporada_jogadorId_idx" ON "EstatisticaJogo"("temporada", "jogadorId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_temporada_timeId_idx" ON "EstatisticaJogo"("temporada", "timeId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_campeonatoId_fase_idx" ON "EstatisticaJogo"("campeonatoId", "fase");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_jogadorId_timeId_temporada_idx" ON "EstatisticaJogo"("jogadorId", "timeId", "temporada");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_temporada_rodada_idx" ON "EstatisticaJogo"("temporada", "rodada");

-- CreateIndex
CREATE INDEX "Jogador_posicao_setor_idx" ON "Jogador"("posicao", "setor");

-- CreateIndex
CREATE INDEX "JogadorTime_timeId_temporada_idx" ON "JogadorTime"("timeId", "temporada");

-- CreateIndex
CREATE INDEX "JogadorTime_jogadorId_temporada_idx" ON "JogadorTime"("jogadorId", "temporada");

-- CreateIndex
CREATE INDEX "Jogo_campeonatoId_status_idx" ON "Jogo"("campeonatoId", "status");

-- CreateIndex
CREATE INDEX "Jogo_campeonatoId_fase_rodada_idx" ON "Jogo"("campeonatoId", "fase", "rodada");

-- CreateIndex
CREATE INDEX "Jogo_temporada_status_fase_idx" ON "Jogo"("temporada", "status", "fase");

-- CreateIndex
CREATE INDEX "Jogo_timeCasaId_temporada_idx" ON "Jogo"("timeCasaId", "temporada");

-- CreateIndex
CREATE INDEX "Jogo_timeVisitanteId_temporada_idx" ON "Jogo"("timeVisitanteId", "temporada");

-- CreateIndex
CREATE INDEX "Jogo_conferencia_regional_status_idx" ON "Jogo"("conferencia", "regional", "status");

-- CreateIndex
CREATE INDEX "Jogo_dataJogo_status_idx" ON "Jogo"("dataJogo", "status");

-- CreateIndex
CREATE INDEX "Time_sigla_temporada_idx" ON "Time"("sigla", "temporada");

-- CreateIndex
CREATE INDEX "Time_nome_temporada_idx" ON "Time"("nome", "temporada");
