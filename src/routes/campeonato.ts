import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { CampeonatoSchema, GrupoSchema, JogoSchema, EstatisticaJogoSchema } from '../schemas/Campeonato'
import { calcularClassificacaoGrupo, gerarJogosCampeonato, verificarProgressaoCampeonato } from '../utils/campeonatoUtils'

const prisma = new PrismaClient()
export const campeonatoRouter = express.Router()

// ===========================================
// ROTAS DE CAMPEONATOS
// ===========================================

// GET /campeonatos - Listar todos os campeonatos
campeonatoRouter.get('/campeonatos', async (req: Request, res: Response) => {
    try {
        const { temporada, tipo, status } = req.query

        const whereClause: any = {}
        if (temporada) whereClause.temporada = String(temporada)
        if (tipo) whereClause.tipo = String(tipo)
        if (status) whereClause.status = String(status)

        const campeonatos = await prisma.campeonato.findMany({
            where: whereClause,
            include: {
                _count: {
                    select: {
                        grupos: true,
                        jogos: true
                    }
                }
            },
            orderBy: [
                { temporada: 'desc' },
                { dataInicio: 'desc' }
            ]
        })

        res.status(200).json(campeonatos)
    } catch (error) {
        console.error('Erro ao buscar campeonatos:', error)
        res.status(500).json({ error: 'Erro ao buscar campeonatos' })
    }
})

// GET /campeonatos/:id - Buscar campeonato específico
campeonatoRouter.get('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: parseInt(id) },
            include: {
                grupos: {
                    include: {
                        times: {
                            include: {
                                time: {
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
                        classificacoes: {
                            include: {
                                time: {
                                    select: {
                                        id: true,
                                        nome: true,
                                        sigla: true,
                                        cor: true,
                                        logo: true
                                    }
                                }
                            },
                            orderBy: { posicao: 'asc' }
                        }
                    },
                    orderBy: { ordem: 'asc' }
                },
                _count: {
                    select: {
                        grupos: true,
                        jogos: true
                    }
                }
            }
        })

        if (!campeonato) {
            return res.status(404).json({ error: 'Campeonato não encontrado' })
        }

        res.status(200).json(campeonato)
    } catch (error) {
        console.error('Erro ao buscar campeonato:', error)
        res.status(500).json({ error: 'Erro ao buscar campeonato' })
    }
})

// POST /campeonatos - Criar novo campeonato
campeonatoRouter.post('/campeonatos', async (req: Request, res: Response) => {
    try {
        const dadosCampeonato = CampeonatoSchema.parse(req.body)
        const { grupos: gruposData, times: timesIds, ...campeonatoData } = req.body

        // Converter datas se necessário
        if (typeof campeonatoData.dataInicio === 'string') {
            campeonatoData.dataInicio = new Date(campeonatoData.dataInicio)
        }
        if (campeonatoData.dataFim && typeof campeonatoData.dataFim === 'string') {
            campeonatoData.dataFim = new Date(campeonatoData.dataFim)
        }

        const campeonato = await prisma.$transaction(async (tx) => {
            // Criar campeonato
            const novoCampeonato = await tx.campeonato.create({
                data: campeonatoData
            })

            // Se tem grupos, criar grupos e associar times
            if (dadosCampeonato.formato.temGrupos && gruposData && Array.isArray(gruposData)) {
                for (let i = 0; i < gruposData.length; i++) {
                    const grupoData = gruposData[i]
                    
                    const grupo = await tx.grupo.create({
                        data: {
                            nome: grupoData.nome,
                            campeonatoId: novoCampeonato.id,
                            ordem: i + 1
                        }
                    })

                    // Associar times ao grupo
                    if (grupoData.times && Array.isArray(grupoData.times)) {
                        const grupoTimes = grupoData.times.map((timeId: number) => ({
                            grupoId: grupo.id,
                            timeId: timeId
                        }))

                        await tx.grupoTime.createMany({
                            data: grupoTimes
                        })

                        // Criar registros de classificação inicial
                        const classificacoes = grupoData.times.map((timeId: number, index: number) => ({
                            grupoId: grupo.id,
                            timeId: timeId,
                            posicao: index + 1
                        }))

                        await tx.classificacaoGrupo.createMany({
                            data: classificacoes
                        })
                    }
                }
            }

            return novoCampeonato
        })

        // Gerar jogos automaticamente se solicitado
        if (req.body.gerarJogos) {
            await gerarJogosCampeonato(campeonato.id)
        }

        res.status(201).json(campeonato)
    } catch (error) {
        console.error('Erro ao criar campeonato:', error)
        res.status(500).json({ 
            error: 'Erro ao criar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

// PUT /campeonatos/:id - Atualizar campeonato
campeonatoRouter.put('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const dadosAtualizacao = CampeonatoSchema.partial().parse(req.body)

        // Converter datas se necessário
        if (dadosAtualizacao.dataInicio && typeof dadosAtualizacao.dataInicio === 'string') {
            dadosAtualizacao.dataInicio = new Date(dadosAtualizacao.dataInicio)
        }
        if (dadosAtualizacao.dataFim && typeof dadosAtualizacao.dataFim === 'string') {
            dadosAtualizacao.dataFim = new Date(dadosAtualizacao.dataFim)
        }

        const campeonato = await prisma.campeonato.update({
            where: { id: parseInt(id) },
            data: dadosAtualizacao,
            include: {
                grupos: {
                    include: {
                        times: {
                            include: { time: true }
                        }
                    }
                }
            }
        })

        res.status(200).json(campeonato)
    } catch (error) {
        console.error('Erro ao atualizar campeonato:', error)
        res.status(500).json({ error: 'Erro ao atualizar campeonato' })
    }
})

// DELETE /campeonatos/:id - Deletar campeonato
campeonatoRouter.delete('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        await prisma.campeonato.delete({
            where: { id: parseInt(id) }
        })

        res.status(200).json({ message: 'Campeonato deletado com sucesso' })
    } catch (error) {
        console.error('Erro ao deletar campeonato:', error)
        res.status(500).json({ error: 'Erro ao deletar campeonato' })
    }
})

// ===========================================
// ROTAS DE GRUPOS
// ===========================================

// GET /campeonatos/:id/grupos - Listar grupos do campeonato
campeonatoRouter.get('/campeonatos/:id/grupos', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const grupos = await prisma.grupo.findMany({
            where: { campeonatoId: parseInt(id) },
            include: {
                times: {
                    include: {
                        time: {
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
                classificacoes: {
                    include: {
                        time: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                cor: true,
                                logo: true
                            }
                        }
                    },
                    orderBy: { posicao: 'asc' }
                }
            },
            orderBy: { ordem: 'asc' }
        })

        res.status(200).json(grupos)
    } catch (error) {
        console.error('Erro ao buscar grupos:', error)
        res.status(500).json({ error: 'Erro ao buscar grupos' })
    }
})

// POST /grupos - Criar novo grupo
campeonatoRouter.post('/grupos', async (req: Request, res: Response) => {
    try {
        const dadosGrupo = GrupoSchema.parse(req.body)
        const { times: timesIds, ...grupoData } = req.body

        const grupo = await prisma.$transaction(async (tx) => {
            const novoGrupo = await tx.grupo.create({
                data: grupoData
            })

            // Associar times se fornecidos
            if (timesIds && Array.isArray(timesIds)) {
                const grupoTimes = timesIds.map((timeId: number) => ({
                    grupoId: novoGrupo.id,
                    timeId: timeId
                }))

                await tx.grupoTime.createMany({
                    data: grupoTimes
                })

                // Criar classificação inicial
                const classificacoes = timesIds.map((timeId: number, index: number) => ({
                    grupoId: novoGrupo.id,
                    timeId: timeId,
                    posicao: index + 1
                }))

                await tx.classificacaoGrupo.createMany({
                    data: classificacoes
                })
            }

            return novoGrupo
        })

        res.status(201).json(grupo)
    } catch (error) {
        console.error('Erro ao criar grupo:', error)
        res.status(500).json({ error: 'Erro ao criar grupo' })
    }
})

// ===========================================
// ROTAS DE JOGOS
// ===========================================

// GET /jogos - Listar jogos com filtros
campeonatoRouter.get('/jogos', async (req: Request, res: Response) => {
    try {
        const { 
            campeonatoId, 
            timeId, 
            grupoId, 
            rodada, 
            status, 
            fase,
            dataInicio,
            dataFim,
            limit = '50',
            offset = '0'
        } = req.query

        const whereClause: any = {}
        
        if (campeonatoId) whereClause.campeonatoId = parseInt(String(campeonatoId))
        if (grupoId) whereClause.grupoId = parseInt(String(grupoId))
        if (rodada) whereClause.rodada = parseInt(String(rodada))
        if (status) whereClause.status = String(status)
        if (fase) whereClause.fase = String(fase)
        
        if (timeId) {
            const timeIdNum = parseInt(String(timeId))
            whereClause.OR = [
                { timeCasaId: timeIdNum },
                { timeVisitanteId: timeIdNum }
            ]
        }

        if (dataInicio || dataFim) {
            whereClause.dataJogo = {}
            if (dataInicio) whereClause.dataJogo.gte = new Date(String(dataInicio))
            if (dataFim) whereClause.dataJogo.lte = new Date(String(dataFim))
        }

        const jogos = await prisma.jogo.findMany({
            where: whereClause,
            include: {
                campeonato: {
                    select: { id: true, nome: true, temporada: true }
                },
                grupo: {
                    select: { id: true, nome: true }
                },
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true,
                        capacete: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true,
                        capacete: true
                    }
                }
            },
            orderBy: [
                { dataJogo: 'asc' },
                { rodada: 'asc' }
            ],
            take: parseInt(String(limit)),
            skip: parseInt(String(offset))
        })

        res.status(200).json(jogos)
    } catch (error) {
        console.error('Erro ao buscar jogos:', error)
        res.status(500).json({ error: 'Erro ao buscar jogos' })
    }
})

// GET /jogos/:id - Buscar jogo específico
campeonatoRouter.get('/jogos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const jogo = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                campeonato: {
                    select: { id: true, nome: true, temporada: true }
                },
                grupo: {
                    select: { id: true, nome: true }
                },
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true,
                        capacete: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true,
                        capacete: true
                    }
                },
                estatisticas: {
                    include: {
                        jogador: {
                            select: {
                                id: true,
                                nome: true,
                                posicao: true,
                                numero: true,
                                camisa: true
                            }
                        }
                    }
                }
            }
        })

        if (!jogo) {
            return res.status(404).json({ error: 'Jogo não encontrado' })
        }

        res.status(200).json(jogo)
    } catch (error) {
        console.error('Erro ao buscar jogo:', error)
        res.status(500).json({ error: 'Erro ao buscar jogo' })
    }
})

// POST /jogos - Criar novo jogo
campeonatoRouter.post('/jogos', async (req: Request, res: Response) => {
    try {
        const dadosJogo = JogoSchema.parse(req.body)

        // Converter data se necessário
        if (typeof dadosJogo.dataJogo === 'string') {
            dadosJogo.dataJogo = new Date(dadosJogo.dataJogo)
        }

        // Verificar se os times são diferentes
        if (dadosJogo.timeCasaId === dadosJogo.timeVisitanteId) {
            return res.status(400).json({ error: 'Um time não pode jogar contra si mesmo' })
        }

        const jogo = await prisma.jogo.create({
            data: dadosJogo,
            include: {
                timeCasa: {
                    select: { id: true, nome: true, sigla: true, cor: true }
                },
                timeVisitante: {
                    select: { id: true, nome: true, sigla: true, cor: true }
                }
            }
        })

        res.status(201).json(jogo)
    } catch (error) {
        console.error('Erro ao criar jogo:', error)
        res.status(500).json({ error: 'Erro ao criar jogo' })
    }
})

// PUT /jogos/:id - Atualizar jogo
campeonatoRouter.put('/jogos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const dadosAtualizacao = JogoSchema.partial().parse(req.body)

        // Converter data se necessário
        if (dadosAtualizacao.dataJogo && typeof dadosAtualizacao.dataJogo === 'string') {
            dadosAtualizacao.dataJogo = new Date(dadosAtualizacao.dataJogo)
        }

        const jogoAnterior = await prisma.jogo.findUnique({
            where: { id: parseInt(id) }
        })

        const jogo = await prisma.jogo.update({
            where: { id: parseInt(id) },
            data: dadosAtualizacao,
            include: {
                timeCasa: {
                    select: { id: true, nome: true, sigla: true, cor: true }
                },
                timeVisitante: {
                    select: { id: true, nome: true, sigla: true, cor: true }
                }
            }
        })

        // Se o placar foi atualizado e o jogo foi finalizado, recalcular classificação
        if (
            jogo.status === 'FINALIZADO' && 
            jogo.grupoId &&
            (jogo.placarCasa !== jogoAnterior?.placarCasa || 
             jogo.placarVisitante !== jogoAnterior?.placarVisitante)
        ) {
            await calcularClassificacaoGrupo(jogo.grupoId)
            
            // Verificar se pode avançar para próxima fase
            await verificarProgressaoCampeonato(jogo.campeonatoId)
        }

        res.status(200).json(jogo)
    } catch (error) {
        console.error('Erro ao atualizar jogo:', error)
        res.status(500).json({ error: 'Erro ao atualizar jogo' })
    }
})

// DELETE /jogos/:id - Deletar jogo
campeonatoRouter.delete('/jogos/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        await prisma.jogo.delete({
            where: { id: parseInt(id) }
        })

        res.status(200).json({ message: 'Jogo deletado com sucesso' })
    } catch (error) {
        console.error('Erro ao deletar jogo:', error)
        res.status(500).json({ error: 'Erro ao deletar jogo' })
    }
})

// ===========================================
// ROTAS DE CLASSIFICAÇÃO
// ===========================================

// GET /classificacao/campeonato/:id - Classificação geral do campeonato
campeonatoRouter.get('/classificacao/campeonato/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const classificacao = await prisma.classificacaoGrupo.findMany({
            where: {
                grupo: { campeonatoId: parseInt(id) }
            },
            include: {
                time: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true
                    }
                },
                grupo: {
                    select: { id: true, nome: true, ordem: true }
                }
            },
            orderBy: [
                { grupo: { ordem: 'asc' } },
                { posicao: 'asc' }
            ]
        })

        res.status(200).json(classificacao)
    } catch (error) {
        console.error('Erro ao buscar classificação:', error)
        res.status(500).json({ error: 'Erro ao buscar classificação' })
    }
})

// GET /classificacao/grupo/:id - Classificação de um grupo específico
campeonatoRouter.get('/classificacao/grupo/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const classificacao = await prisma.classificacaoGrupo.findMany({
            where: { grupoId: parseInt(id) },
            include: {
                time: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true
                    }
                }
            },
            orderBy: { posicao: 'asc' }
        })

        res.status(200).json(classificacao)
    } catch (error) {
        console.error('Erro ao buscar classificação do grupo:', error)
        res.status(500).json({ error: 'Erro ao buscar classificação do grupo' })
    }
})

// POST /classificacao/recalcular/:grupoId - Recalcular classificação manualmente
campeonatoRouter.post('/classificacao/recalcular/:grupoId', async (req: Request, res: Response) => {
    try {
        const { grupoId } = req.params

        const classificacao = await calcularClassificacaoGrupo(parseInt(grupoId))

        res.status(200).json({ 
            message: 'Classificação recalculada com sucesso',
            classificacao 
        })
    } catch (error) {
        console.error('Erro ao recalcular classificação:', error)
        res.status(500).json({ error: 'Erro ao recalcular classificação' })
    }
})

// ===========================================
// ROTAS DE ESTATÍSTICAS DE JOGOS
// ===========================================

// POST /jogos/:id/estatisticas - Processar estatísticas de um jogo
campeonatoRouter.post('/jogos/:id/estatisticas', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { estatisticas } = req.body

        if (!Array.isArray(estatisticas)) {
            return res.status(400).json({ error: 'Estatísticas devem ser um array' })
        }

        const jogo = await prisma.jogo.findUnique({
            where: { id: parseInt(id) }
        })

        if (!jogo) {
            return res.status(404).json({ error: 'Jogo não encontrado' })
        }

        const estatisticasProcessadas = await prisma.$transaction(async (tx) => {
            // Deletar estatísticas antigas do jogo
            await tx.estatisticaJogo.deleteMany({
                where: { jogoId: parseInt(id) }
            })

            // Criar novas estatísticas
            const novasEstatisticas = []
            for (const stat of estatisticas) {
                const dadosValidados = EstatisticaJogoSchema.parse({
                    ...stat,
                    jogoId: parseInt(id)
                })

                const estatistica = await tx.estatisticaJogo.create({
                    data: dadosValidados,
                    include: {
                        jogador: {
                            select: { id: true, nome: true, posicao: true }
                        }
                    }
                })

                novasEstatisticas.push(estatistica)
            }

            // Marcar jogo como tendo estatísticas processadas
            await tx.jogo.update({
                where: { id: parseInt(id) },
                data: { estatisticasProcessadas: true }
            })

            return novasEstatisticas
        })

        res.status(200).json({
            message: 'Estatísticas processadas com sucesso',
            estatisticas: estatisticasProcessadas
        })
    } catch (error) {
        console.error('Erro ao processar estatísticas:', error)
        res.status(500).json({ error: 'Erro ao processar estatísticas' })
    }
})

// ===========================================
// ROTAS UTILITÁRIAS
// ===========================================

// POST /campeonatos/:id/gerar-jogos - Gerar jogos automaticamente
campeonatoRouter.post('/campeonatos/:id/gerar-jogos', async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const jogosGerados = await gerarJogosCampeonato(parseInt(id))

        res.status(200).json({
            message: 'Jogos gerados com sucesso',
            totalJogos: jogosGerados
        })
    } catch (error) {
        console.error('Erro ao gerar jogos:', error)
        res.status(500).json({ error: 'Erro ao gerar jogos' })
    }
})

// GET /campeonatos/:id/proximos-jogos - Próximos jogos do campeonato
campeonatoRouter.get('/campeonatos/:id/proximos-jogos', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { limit = '10' } = req.query

        const proximosJogos = await prisma.jogo.findMany({
            where: {
                campeonatoId: parseInt(id),
                status: { in: ['AGENDADO', 'AO_VIVO'] },
                dataJogo: { gte: new Date() }
            },
            include: {
                timeCasa: {
                    select: { id: true, nome: true, sigla: true, cor: true, logo: true }
                },
                timeVisitante: {
                    select: { id: true, nome: true, sigla: true, cor: true, logo: true }
                },
                grupo: {
                    select: { id: true, nome: true }
                }
            },
            orderBy: { dataJogo: 'asc' },
            take: parseInt(String(limit))
        })

        res.status(200).json(proximosJogos)
    } catch (error) {
        console.error('Erro ao buscar próximos jogos:', error)
        res.status(500).json({ error: 'Erro ao buscar próximos jogos' })
    }
})

// GET /campeonatos/:id/ultimos-resultados - Últimos resultados do campeonato
campeonatoRouter.get('/campeonatos/:id/ultimos-resultados', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { limit = '10' } = req.query

        const ultimosResultados = await prisma.jogo.findMany({
            where: {
                campeonatoId: parseInt(id),
                status: 'FINALIZADO'
            },
            include: {
                timeCasa: {
                    select: { id: true, nome: true, sigla: true, cor: true, logo: true }
                },
                timeVisitante: {
                    select: { id: true, nome: true, sigla: true, cor: true, logo: true }
                },
                grupo: {
                    select: { id: true, nome: true }
                }
            },
            orderBy: { dataJogo: 'desc' },
            take: parseInt(String(limit))
        })

        res.status(200).json(ultimosResultados)
    } catch (error) {
        console.error('Erro ao buscar últimos resultados:', error)
        res.status(500).json({ error: 'Erro ao buscar últimos resultados' })
    }
})