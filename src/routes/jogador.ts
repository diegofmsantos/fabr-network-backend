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



// Rota para buscar estatísticas jogo a jogo de um jogador
jogadorRouter.get('/:id/estatisticas-jogo', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { temporada } = req.query
        const jogadorId = parseInt(id, 10)

        console.log(`🔍 [ROTA] Buscando estatísticas para jogador ${jogadorId}, temporada: ${temporada}`)

        if (isNaN(jogadorId)) {
            res.status(400).json({ error: 'ID do jogador inválido' })
            return
        }

        // Buscar todas as estatísticas de jogo do jogador
        const estatisticasJogo = await prisma.estatisticaJogo.findMany({
            where: {
                jogadorId: jogadorId,
                temporada: temporada as string || '2025'
            },
            include: {
                jogo: {
                    include: {
                        timeCasa: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                cor: true,
                                logo: true
                            }
                        },
                        timeVisitante: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                cor: true,
                                logo: true
                            }
                        }
                    }
                },
                jogador: {
                    select: {
                        id: true,
                        nome: true,
                        posicao: true,
                        setor: true
                    }
                },
                time: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true
                    }
                }
            },
            orderBy: {
                jogo: {
                    dataJogo: 'desc'
                }
            }
        })

        console.log(`✅ [ROTA] Encontradas ${estatisticasJogo.length} estatísticas`)

        // Formatar dados para o frontend
        const estatisticasFormatadas = estatisticasJogo.map(stat => ({
            id: stat.id,
            jogoId: stat.jogoId,
            jogadorId: stat.jogadorId,
            timeId: stat.timeId,
            temporada: stat.temporada,
            estatisticas: stat.estatisticas,

            // Dados do jogo
            jogo: {
                id: stat.jogo.id,
                dataJogo: stat.jogo.dataJogo,
                status: stat.jogo.status,
                placarCasa: stat.jogo.placarCasa,
                placarVisitante: stat.jogo.placarVisitante,
                rodada: stat.jogo.rodada,
                fase: stat.jogo.fase,
                local: stat.jogo.local,
                timeCasaId: stat.jogo.timeCasaId,
                timeVisitanteId: stat.jogo.timeVisitanteId,
                timeCasa: stat.jogo.timeCasa,
                timeVisitante: stat.jogo.timeVisitante
            },

            // Dados do jogador
            jogador: stat.jogador,

            // Dados do time
            time: stat.time
        }))

        res.json(estatisticasFormatadas)

    } catch (error) {
        console.error('❌ [ROTA] Erro ao buscar estatísticas:', error)
        res.status(500).json({
            error: 'Erro ao buscar estatísticas jogo a jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

export default jogadorRouter