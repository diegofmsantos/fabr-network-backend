import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { JogadorSchema } from '../schemas/Jogador'

const prisma = new PrismaClient()

export const jogadorRouter = express.Router()

jogadorRouter.get('/jogadores', async (req, res) => {
    try {
        const {
            temporada = '2025',
            timeId,
            includeAllTemporadas = false
        } = req.query;

        console.log('Parâmetros recebidos na busca de jogadores:', {
            temporada,
            timeId,
            includeAllTemporadas
        });

        const whereCondition: any = {
            temporada: String(temporada)
        };

        if (timeId) {
            whereCondition.timeId = parseInt(String(timeId));
        }

        const jogadoresTimesQuery = await prisma.jogadorTime.findMany({
            where: whereCondition,
            include: {
                jogador: true,
                time: true
            },
            orderBy: [
                { numero: 'asc' },
                { jogador: { nome: 'asc' } }
            ]
        });

        const jogadoresFormatados = jogadoresTimesQuery.map(jt => ({
            ...jt.jogador,
            numero: jt.numero,
            camisa: jt.camisa,
            estatisticas: jt.estatisticas || {},
            timeId: jt.timeId,
            time: jt.time ? {
                id: jt.time.id,
                nome: jt.time.nome,
                sigla: jt.time.sigla,
                cor: jt.time.cor
            } : null,
            temporada: jt.temporada
        }));

        if (includeAllTemporadas === 'true' && !timeId) {
            const jogadoresTodasTemporadas = await prisma.jogadorTime.findMany({
                where: {
                    jogadorId: { in: jogadoresFormatados.map(j => j.id) }
                },
                include: {
                    jogador: true,
                    time: true
                },
                distinct: ['jogadorId', 'temporada']
            });

            jogadoresFormatados.forEach(jogador => {
                (jogador as any).historicoTemporadas = jogadoresTodasTemporadas
                    .filter(jt => jt.jogadorId === jogador.id)
                    .map(jt => ({
                        temporada: jt.temporada,
                        time: jt.time ? {
                            id: jt.time.id,
                            nome: jt.time.nome,
                            sigla: jt.time.sigla
                        } : null
                    }));
            });
        }

        console.log(`Jogadores encontrados: ${jogadoresFormatados.length}`);

        res.status(200).json(jogadoresFormatados);
    } catch (error) {
        console.error('Erro na rota de jogadores:', error);
        res.status(500).json({
            error: 'Erro ao buscar jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});


jogadorRouter.get('/jogador/:id/temporada/:ano', async (req: Request, res: Response) => {
    try {
        const { id, ano } = req.params;
        const jogadorId = parseInt(id, 10);

        if (isNaN(jogadorId)) {
            res.status(400).json({ error: 'ID do jogador inválido' });
            return;
        }

        const jogadorTime = await prisma.jogadorTime.findFirst({
            where: {
                jogadorId,
                temporada: ano,
            },
            include: {
                jogador: true,
                time: true,
            },
        });

        if (!jogadorTime) {
            res.status(404).json({ error: 'Jogador não encontrado nesta temporada' });
            return;
        }

        res.status(200).json({
            jogador: jogadorTime.jogador,
            time: jogadorTime.time,
            estatisticas: jogadorTime.estatisticas,
            numero: jogadorTime.numero,
            camisa: jogadorTime.camisa,
        });
        return;

    } catch (error) {
        console.error('Erro ao buscar jogador:', error);
        res.status(500).json({ error: 'Erro ao buscar jogador' });
        return
    }
});

jogadorRouter.post('/jogador', async (req, res) => {
    try {
        const { temporada = '2025', ...jogadorRawData } = req.body;
        const jogadorData = JogadorSchema.parse(jogadorRawData);

        const estatisticas = jogadorData.estatisticas ?? {};

        if (!jogadorData.timeId) {
            res.status(400).json({ error: 'O campo "timeId" é obrigatório.' });
            return;
        }

        const timeExiste = await prisma.time.findUnique({
            where: { id: jogadorData.timeId }
        });

        if (!timeExiste) {
            res.status(404).json({ error: 'Time não encontrado.' });
            return;
        }

        const jogadorCriado = await prisma.jogador.create({
            data: {
                nome: jogadorData.nome ?? '',
                posicao: jogadorData.posicao ?? '',
                setor: jogadorData.setor ?? 'Ataque',
                experiencia: jogadorData.experiencia ?? 0,
                idade: jogadorData.idade ?? 0,
                altura: jogadorData.altura ?? 0,
                peso: jogadorData.peso ?? 0,
                instagram: jogadorData.instagram ?? '',
                instagram2: jogadorData.instagram2 ?? '',
                cidade: jogadorData.cidade ?? '',
                nacionalidade: jogadorData.nacionalidade ?? '',
                timeFormador: jogadorData.timeFormador ?? '',
            },
        });

        const jogadorTimeVinculo = await prisma.jogadorTime.create({
            data: {
                jogadorId: jogadorCriado.id,
                timeId: jogadorData.timeId,
                temporada: String(temporada),
                numero: jogadorData.numero ?? 0,
                camisa: jogadorData.camisa ?? '',
                estatisticas: estatisticas,
            }
        });

        res.status(201).json({
            jogador: jogadorCriado,
            vinculo: jogadorTimeVinculo
        });
    } catch (error) {
        console.error('Erro ao criar o jogador:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});

jogadorRouter.put('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" });
            return;
        }

        const { estatisticas, numero, camisa, timeId, temporada, id: bodyId, ...dadosJogador } = req.body;

        console.log("Valor de camisa recebido:", camisa);

        if (dadosJogador.altura !== undefined) {
            dadosJogador.altura = Number(String(dadosJogador.altura).replace(',', '.'));
        }
        if (dadosJogador.peso !== undefined) dadosJogador.peso = Number(dadosJogador.peso);
        if (dadosJogador.idade !== undefined) dadosJogador.idade = Number(dadosJogador.idade);
        if (dadosJogador.experiencia !== undefined) dadosJogador.experiencia = Number(dadosJogador.experiencia);

        const updatedJogador = await prisma.jogador.update({
            where: { id },
            data: dadosJogador,
        });

        if (temporada && timeId) {
            const vinculoExistente = await prisma.jogadorTime.findFirst({
                where: {
                    jogadorId: id,
                    timeId: parseInt(String(timeId)),
                    temporada: temporada,
                }
            });

            if (vinculoExistente) {
                const updateData = {
                    numero: numero !== undefined ? parseInt(String(numero)) : vinculoExistente.numero,
                    camisa: camisa !== undefined ? camisa : vinculoExistente.camisa,
                    estatisticas: estatisticas || vinculoExistente.estatisticas,
                };

                console.log("Atualizando vínculo com camisa:", updateData.camisa);

                const vinculoAtualizado = await prisma.jogadorTime.update({
                    where: { id: vinculoExistente.id },
                    data: updateData,
                });

                console.log("Camisa após atualização:", vinculoAtualizado.camisa);
            } else {
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: id,
                        timeId: parseInt(String(timeId)),
                        temporada: temporada,
                        numero: numero !== undefined ? parseInt(String(numero)) : 0,
                        camisa: camisa || '',
                        estatisticas: estatisticas || {},
                    }
                });
            }
        }

        const jogadorComVinculos = await prisma.jogador.findUnique({
            where: { id },
            include: {
                times: {
                    where: {
                        timeId: timeId ? parseInt(String(timeId)) : undefined,
                        temporada: temporada || undefined,
                    },
                    select: {
                        id: true,
                        temporada: true,
                        numero: true,
                        camisa: true,
                        estatisticas: true,
                        time: true
                    }
                }
            }
        });

        res.status(200).json(jogadorComVinculos);
    } catch (error) {
        console.error("Erro ao atualizar o jogador:", error);
        res.status(500).json({ error: "Erro ao atualizar o jogador" });
    }
});

jogadorRouter.get('/jogador/:jogadorId/por-jogo', async (req: Request, res: Response) => {
    try {
        const { jogadorId } = req.params
        const { temporada = '2025' } = req.query

        console.log(`🎯 Buscando estatísticas por jogo para jogador: ${jogadorId}, temporada: ${temporada}`)

        const estatisticas = await prisma.estatisticaJogo.findMany({
            where: {
                jogadorId: parseInt(jogadorId),
                temporada: temporada as string
            },
            include: {
                jogo: {
                    include: {
                        timeCasa: { select: { nome: true, sigla: true, logo: true } },
                        timeVisitante: { select: { nome: true, sigla: true, logo: true } }
                    }
                },
                time: { select: { nome: true, sigla: true } }
            },
            orderBy: {
                jogo: { dataJogo: 'desc' }
            }
        })

        // Processar dados para o formato esperado pelo frontend
        const estatisticasProcessadas = estatisticas.map(est => {
            const jogo = est.jogo
            const isTimeCasa = est.timeId === jogo.timeCasaId
            const adversario = isTimeCasa ? jogo.timeVisitante : jogo.timeCasa

            const stats = est.estatisticas as any

            return {
                dataJogo: jogo.dataJogo,
                adversario,
                local: isTimeCasa ? 'Casa' : 'Visitante',
                resultado: jogo.status === 'FINALIZADO' ? {
                    placarCasa: jogo.placarCasa,
                    placarVisitante: jogo.placarVisitante,
                    vitoria: (isTimeCasa && (jogo.placarCasa || 0) > (jogo.placarVisitante || 0)) ||
                        (!isTimeCasa && (jogo.placarVisitante || 0) > (jogo.placarCasa || 0))
                } : null,
                passes: {
                    completos: stats.passe?.passes_completos || 0,
                    tentados: stats.passe?.passes_tentados || 0,
                    jardas: stats.passe?.jardas_de_passe || 0,
                    touchdowns: stats.passe?.td_passados || 0,
                    interceptacoes: stats.passe?.interceptacoes_sofridas || 0,
                    sacks: stats.passe?.sacks_sofridos || 0,
                    fumbles: stats.passe?.fumble_de_passador || 0,
                    percentual: stats.passe?.passes_tentados > 0
                        ? (stats.passe?.passes_completos / stats.passe?.passes_tentados) * 100
                        : 0,
                    media: stats.passe?.passes_tentados > 0
                        ? stats.passe?.jardas_de_passe / stats.passe?.passes_tentados
                        : 0
                },
                corrida: {
                    tentativas: stats.corrida?.corridas || 0,
                    jardas: stats.corrida?.jardas_corridas || 0,
                    touchdowns: stats.corrida?.tds_corridos || 0,
                    fumbles: stats.corrida?.fumble_de_corredor || 0,
                    media: stats.corrida?.corridas > 0
                        ? stats.corrida?.jardas_corridas / stats.corrida?.corridas
                        : 0
                },
                recepcao: {
                    recepcoes: stats.recepcao?.recepcoes || 0,
                    alvos: stats.recepcao?.alvo || 0,
                    jardas: stats.recepcao?.jardas_recebidas || 0,
                    touchdowns: stats.recepcao?.tds_recebidos || 0,
                    media: stats.recepcao?.recepcoes > 0
                        ? stats.recepcao?.jardas_recebidas / stats.recepcao?.recepcoes
                        : 0
                },
                defesa: {
                    tackles: stats.defesa?.tackles_totais || 0,
                    tacklesForLoss: stats.defesa?.tackles_for_loss || 0,
                    sacks: stats.defesa?.sacks_forcado || 0,
                    fumbles: stats.defesa?.fumble_forcado || 0,
                    interceptacoes: stats.defesa?.interceptacao_forcada || 0,
                    passesDesviados: stats.defesa?.passe_desviado || 0,
                    touchdowns: stats.defesa?.td_defensivo || 0
                },
                retorno: {
                    retornos: stats.retorno?.retornos || 0,
                    jardas: stats.retorno?.jardas_retornadas || 0,
                    touchdowns: stats.retorno?.td_retornados || 0,
                    media: stats.retorno?.retornos > 0
                        ? stats.retorno?.jardas_retornadas / stats.retorno?.retornos
                        : 0
                },
                kicker: {
                    fgBons: stats.kicker?.fg_bons || 0,
                    fgTentativas: stats.kicker?.tentativas_de_fg || 0,
                    fgMaisLongo: stats.kicker?.fg_mais_longo || 0,
                    xpBons: stats.kicker?.xp_bons || 0,
                    xpTentativas: stats.kicker?.tentativas_de_xp || 0,
                    fgPercentual: stats.kicker?.tentativas_de_fg > 0
                        ? (stats.kicker?.fg_bons / stats.kicker?.tentativas_de_fg) * 100
                        : 0,
                    xpPercentual: stats.kicker?.tentativas_de_xp > 0
                        ? (stats.kicker?.xp_bons / stats.kicker?.tentativas_de_xp) * 100
                        : 0
                },
                punter: {
                    punts: stats.punter?.punts || 0,
                    jardas: stats.punter?.jardas_de_punt || 0,
                    media: stats.punter?.punts > 0
                        ? stats.punter?.jardas_de_punt / stats.punter?.punts
                        : 0
                }
            }
        })

        console.log(`✅ Retornando ${estatisticasProcessadas.length} jogos`)

        res.json(estatisticasProcessadas)
    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas por jogo:', error)
        res.status(500).json({
            error: 'Erro ao buscar estatísticas por jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})