import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'

const prisma = new PrismaClient()
const campeonatosRouter = express.Router()

const validarId = (id: string) => {
    const numId = parseInt(id)
    if (isNaN(numId) || numId <= 0) {
        throw new Error('ID inválido')
    }
    return numId
}

campeonatosRouter.get('/campeonatos', async (req: Request, res: Response) => {
    try {
        const { temporada, tipo, status } = req.query

        const where: any = {}
        
        if (temporada) {
            where.temporada = String(temporada)
        }
        
        if (tipo) {
            if (tipo === 'SUPERLIGA') {
                where.isSuperliga = true
            } else {
                where.isSuperliga = false
            }
        }
        
        if (status) {
            where.status = String(status)
        }

        const campeonatos = await prisma.campeonato.findMany({
            where,
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                },
                _count: {
                    select: {
                        jogos: true,
                        conferencias: true
                    }
                }
            },
            orderBy: [
                { temporada: 'desc' },
                { createdAt: 'desc' }
            ]
        })

        res.status(200).json(campeonatos)
    } catch (error) {
        console.error('Erro ao buscar campeonatos:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar campeonatos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                },
                jogos: {
                    include: {
                        timeCasa: true,
                        timeVisitante: true
                    }
                },
                _count: {
                    select: {
                        jogos: true,
                        conferencias: true
                    }
                }
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        res.status(200).json(campeonato)
    } catch (error) {
        console.error('Erro ao buscar campeonato:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.post('/campeonatos', async (req: Request, res: Response) => {
    try {
        const { nome, temporada, tipo, status, dataInicio, dataFim, descricao } = req.body

        const campeonato = await prisma.campeonato.create({
            data: {
                nome,
                temporada,
                status: status || 'NAO_INICIADO',
                dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                dataFim: dataFim ? new Date(dataFim) : null,
                descricao,
                isSuperliga: tipo === 'SUPERLIGA' || false
            }
        })

        res.status(201).json(campeonato)
    } catch (error) {
        console.error('Erro ao criar campeonato:', error)
        res.status(500).json({ 
            error: 'Erro ao criar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.put('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)
        const { nome, temporada, status, dataInicio, dataFim, descricao } = req.body

        const campeonato = await prisma.campeonato.update({
            where: { id: campeonatoId },
            data: {
                nome,
                temporada,
                status,
                dataInicio: dataInicio ? new Date(dataInicio) : undefined,
                dataFim: dataFim ? new Date(dataFim) : undefined,
                descricao
            }
        })

        res.status(200).json(campeonato)
    } catch (error) {
        console.error('Erro ao atualizar campeonato:', error)
        res.status(500).json({ 
            error: 'Erro ao atualizar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.delete('/campeonatos/:id', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        await prisma.campeonato.delete({
            where: { id: campeonatoId }
        })

        res.status(200).json({ message: 'Campeonato deletado com sucesso' })
    } catch (error) {
        console.error('Erro ao deletar campeonato:', error)
        res.status(500).json({ 
            error: 'Erro ao deletar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/campeonatos/:id/grupos', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const grupos = await prisma.grupo.findMany({
            where: { campeonatoId },
            include: {
                times: {
                    include: {
                        time: true
                    }
                },
                _count: {
                    select: {
                        times: true
                    }
                }
            },
            orderBy: { ordem: 'asc' }
        })

        res.status(200).json(grupos)
    } catch (error) {
        console.error('Erro ao buscar grupos:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar grupos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/campeonatos/:id/proximos-jogos', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)
        const { limit } = req.query
        const limitNum = limit ? parseInt(String(limit)) : 10

        const jogos = await prisma.jogo.findMany({
            where: {
                campeonatoId,
                status: { in: ['AGENDADO', 'AO_VIVO'] }
            },
            include: {
                timeCasa: true,
                timeVisitante: true
            },
            orderBy: { dataJogo: 'asc' },
            take: limitNum
        })

        res.status(200).json(jogos)
    } catch (error) {
        console.error('Erro ao buscar próximos jogos:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar próximos jogos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/campeonatos/:id/ultimos-resultados', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)
        const { limit } = req.query
        const limitNum = limit ? parseInt(String(limit)) : 10

        const jogos = await prisma.jogo.findMany({
            where: {
                campeonatoId,
                status: 'FINALIZADO'
            },
            include: {
                timeCasa: true,
                timeVisitante: true
            },
            orderBy: { dataJogo: 'desc' },
            take: limitNum
        })

        res.status(200).json(jogos)
    } catch (error) {
        console.error('Erro ao buscar últimos resultados:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar últimos resultados',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/jogos', async (req: Request, res: Response) => {
    try {
        const { campeonatoId, status, fase, timeId, rodada } = req.query

        const where: any = {}
        
        if (campeonatoId) {
            where.campeonatoId = parseInt(String(campeonatoId))
        }
        
        if (status) {
            where.status = String(status)
        }
        
        if (fase) {
            where.fase = String(fase)
        }
        
        if (timeId) {
            const timeIdNum = parseInt(String(timeId))
            where.OR = [
                { timeCasaId: timeIdNum },
                { timeVisitanteId: timeIdNum }
            ]
        }
        
        if (rodada) {
            where.rodada = parseInt(String(rodada))
        }

        const jogos = await prisma.jogo.findMany({
            where,
            include: {
                timeCasa: true,
                timeVisitante: true,
                campeonato: true
            },
            orderBy: [
                { dataJogo: 'desc' },
                { rodada: 'asc' }
            ]
        })

        res.status(200).json(jogos)
    } catch (error) {
        console.error('Erro ao buscar jogos:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar jogos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/jogos/:id', async (req: Request, res: Response) => {
    try {
        const jogoId = validarId(req.params.id)

        const jogo = await prisma.jogo.findUnique({
            where: { id: jogoId },
            include: {
                timeCasa: true,
                timeVisitante: true,
                campeonato: true,
                estatisticas: {
                    include: {
                        jogador: true,
                        time: true
                    }
                }
            }
        })

        if (!jogo) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        res.status(200).json(jogo)
    } catch (error) {
        console.error('Erro ao buscar jogo:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

campeonatosRouter.get('/classificacao/:campeonatoId', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.campeonatoId)

        const grupos = await prisma.grupo.findMany({
            where: { campeonatoId },
            include: {
                times: {
                    include: { time: true }
                }
            }
        })

        const classificacoes = []

        for (const grupo of grupos) {
            const classificacaoGrupo = []

            for (const grupoTime of grupo.times) {
                const jogos = await prisma.jogo.findMany({
                    where: {
                        campeonatoId,
                        OR: [
                            { timeCasaId: grupoTime.timeId },
                            { timeVisitanteId: grupoTime.timeId }
                        ],
                        status: 'FINALIZADO'
                    }
                })

                let vitorias = 0
                let derrotas = 0
                let pontosPro = 0
                let pontosContra = 0

                jogos.forEach(jogo => {
                    const isTimeCasa = jogo.timeCasaId === grupoTime.timeId
                    const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
                    const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

                    pontosPro += pontosFeitos
                    pontosContra += pontosSofridos

                    if (pontosFeitos > pontosSofridos) {
                        vitorias++
                    } else {
                        derrotas++
                    }
                })

                const saldo = pontosPro - pontosContra
                const aproveitamento = jogos.length > 0 ? (vitorias / jogos.length) * 100 : 0

                classificacaoGrupo.push({
                    timeId: grupoTime.timeId,
                    time: grupoTime.time,
                    jogos: jogos.length,
                    vitorias,
                    derrotas,
                    pontosPro,
                    pontosContra,
                    saldo,
                    aproveitamento
                })
            }

            classificacaoGrupo.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacaoGrupo.forEach((item, index) => {
                (item as any).posicao = index + 1
            })

            classificacoes.push({
                grupo: grupo.nome,
                grupoId: grupo.id,
                classificacao: classificacaoGrupo
            })
        }

        res.status(200).json(classificacoes)
    } catch (error) {
        console.error('Erro ao buscar classificação:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar classificação',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

export { campeonatosRouter }
export default campeonatosRouter