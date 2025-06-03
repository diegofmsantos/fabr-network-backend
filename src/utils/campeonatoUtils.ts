import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Calcular classificação de um grupo específico
export async function calcularClassificacaoGrupo(grupoId: number) {
    try {
        // Buscar todos os jogos finalizados do grupo
        const jogos = await prisma.jogo.findMany({
            where: {
                grupoId: grupoId,
                status: 'FINALIZADO'
            },
            include: {
                timeCasa: { select: { id: true, nome: true } },
                timeVisitante: { select: { id: true, nome: true } }
            }
        })

        // Buscar todos os times do grupo
        const grupoTimes = await prisma.grupoTime.findMany({
            where: { grupoId },
            include: { time: { select: { id: true, nome: true } } }
        })

        // Inicializar estatísticas de cada time
        const estatisticas = new Map()
        
        grupoTimes.forEach(gt => {
            estatisticas.set(gt.timeId, {
                timeId: gt.timeId,
                jogos: 0,
                vitorias: 0,
                empates: 0,
                derrotas: 0,
                pontosPro: 0,
                pontosContra: 0,
                saldoPontos: 0,
                pontos: 0,
                aproveitamento: 0
            })
        })

        // Processar cada jogo
        jogos.forEach(jogo => {
            if (jogo.placarCasa !== null && jogo.placarVisitante !== null) {
                const statsCasa = estatisticas.get(jogo.timeCasaId)
                const statsVisitante = estatisticas.get(jogo.timeVisitanteId)

                if (statsCasa && statsVisitante) {
                    // Atualizar estatísticas do time da casa
                    statsCasa.jogos++
                    statsCasa.pontosPro += jogo.placarCasa
                    statsCasa.pontosContra += jogo.placarVisitante
                    statsCasa.saldoPontos = statsCasa.pontosPro - statsCasa.pontosContra

                    // Atualizar estatísticas do time visitante
                    statsVisitante.jogos++
                    statsVisitante.pontosPro += jogo.placarVisitante
                    statsVisitante.pontosContra += jogo.placarCasa
                    statsVisitante.saldoPontos = statsVisitante.pontosPro - statsVisitante.pontosContra

                    // Determinar resultado
                    if (jogo.placarCasa > jogo.placarVisitante) {
                        // Time da casa venceu
                        statsCasa.vitorias++
                        statsCasa.pontos += 3
                        statsVisitante.derrotas++
                    } else if (jogo.placarVisitante > jogo.placarCasa) {
                        // Time visitante venceu
                        statsVisitante.vitorias++
                        statsVisitante.pontos += 3
                        statsCasa.derrotas++
                    } else {
                        // Empate
                        statsCasa.empates++
                        statsCasa.pontos += 1
                        statsVisitante.empates++
                        statsVisitante.pontos += 1
                    }

                    // Calcular aproveitamento
                    const pontosMaximosCasa = statsCasa.jogos * 3
                    const pontosMaximosVisitante = statsVisitante.jogos * 3
                    
                    statsCasa.aproveitamento = pontosMaximosCasa > 0 ? 
                        (statsCasa.pontos / pontosMaximosCasa) * 100 : 0
                    statsVisitante.aproveitamento = pontosMaximosVisitante > 0 ? 
                        (statsVisitante.pontos / pontosMaximosVisitante) * 100 : 0
                }
            }
        })

        // Ordenar times por classificação
        const timesOrdenados = Array.from(estatisticas.values()).sort((a, b) => {
            // 1º critério: pontos
            if (b.pontos !== a.pontos) return b.pontos - a.pontos
            // 2º critério: saldo de pontos
            if (b.saldoPontos !== a.saldoPontos) return b.saldoPontos - a.saldoPontos
            // 3º critério: pontos pró
            return b.pontosPro - a.pontosPro
        })

        // Atualizar tabela de classificação no banco
        await prisma.$transaction(async (tx) => {
            // Deletar classificação antiga
            await tx.classificacaoGrupo.deleteMany({
                where: { grupoId }
            })

            // Inserir nova classificação
            const classificacoes = timesOrdenados.map((stats, index) => ({
                grupoId,
                timeId: stats.timeId,
                posicao: index + 1,
                jogos: stats.jogos,
                vitorias: stats.vitorias,
                empates: stats.empates,
                derrotas: stats.derrotas,
                pontosPro: stats.pontosPro,
                pontosContra: stats.pontosContra,
                saldoPontos: stats.saldoPontos,
                pontos: stats.pontos,
                aproveitamento: stats.aproveitamento
            }))

            await tx.classificacaoGrupo.createMany({
                data: classificacoes
            })
        })

        return timesOrdenados

    } catch (error) {
        console.error('Erro ao calcular classificação do grupo:', error)
        throw new Error('Erro ao calcular classificação')
    }
}

// Gerar jogos automaticamente para um campeonato
export async function gerarJogosCampeonato(campeonatoId: number) {
    try {
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
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

        if (!campeonato) {
            throw new Error('Campeonato não encontrado')
        }

        const formato = campeonato.formato as any
        const jogosParaCriar = []

        // Se tem grupos, gerar jogos dentro de cada grupo
        if (formato.temGrupos && campeonato.grupos.length > 0) {
            for (const grupo of campeonato.grupos) {
                const times = grupo.times.map(gt => gt.time)
                
                // Gerar todos contra todos no grupo
                for (let rodada = 1; rodada <= formato.numeroRodadas; rodada++) {
                    for (let i = 0; i < times.length; i++) {
                        for (let j = i + 1; j < times.length; j++) {
                            const dataBase = new Date(campeonato.dataInicio)
                            const diasParaSomar = (rodada - 1) * 7 // Uma rodada por semana
                            dataBase.setDate(dataBase.getDate() + diasParaSomar)

                            // Jogo de ida (se for pontos corridos duplos)
                            jogosParaCriar.push({
                                campeonatoId,
                                grupoId: grupo.id,
                                timeCasaId: times[i].id,
                                timeVisitanteId: times[j].id,
                                dataJogo: new Date(dataBase),
                                rodada,
                                fase: 'FASE_GRUPOS',
                                status: 'AGENDADO'
                            })

                            // Se for turno e returno
                            if (formato.tipoDisputa === 'PONTOS_CORRIDOS' && formato.numeroRodadas > times.length - 1) {
                                const dataVolta = new Date(dataBase)
                                dataVolta.setDate(dataVolta.getDate() + (formato.numeroRodadas * 7))
                                
                                jogosParaCriar.push({
                                    campeonatoId,
                                    grupoId: grupo.id,
                                    timeCasaId: times[j].id,
                                    timeVisitanteId: times[i].id,
                                    dataJogo: dataVolta,
                                    rodada: rodada + formato.numeroRodadas,
                                    fase: 'FASE_GRUPOS',
                                    status: 'AGENDADO'
                                })
                            }
                        }
                    }
                }
            }
        }

        // Salvar jogos no banco
        if (jogosParaCriar.length > 0) {
            await prisma.jogo.createMany({
                data: jogosParaCriar
            })
        }

        return jogosParaCriar.length

    } catch (error) {
        console.error('Erro ao gerar jogos do campeonato:', error)
        throw new Error('Erro ao gerar jogos')
    }
}

// Verificar se um campeonato pode avançar para próxima fase
export async function verificarProgressaoCampeonato(campeonatoId: number) {
    try {
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                jogos: {
                    where: { status: { not: 'FINALIZADO' } }
                }
            }
        })

        if (!campeonato) return false

        const formato = campeonato.formato as any
        
        // Se ainda há jogos não finalizados, não pode avançar
        if (campeonato.jogos.length > 0) return false

        // Se tem playoffs configurados e ainda não foram gerados
        if (formato.temPlayoffs) {
            const jogosPlayoffs = await prisma.jogo.count({
                where: {
                    campeonatoId,
                    fase: { not: 'FASE_GRUPOS' }
                }
            })

            if (jogosPlayoffs === 0) {
                // Gerar jogos de playoffs
                await gerarJogosPlayoffs(campeonatoId)
                return true
            }
        }

        return false

    } catch (error) {
        console.error('Erro ao verificar progressão do campeonato:', error)
        return false
    }
}

// Gerar jogos de playoffs
async function gerarJogosPlayoffs(campeonatoId: number) {
    // Implementação simplificada - pode ser expandida
    console.log(`Gerando playoffs para campeonato ${campeonatoId}`)
    
    // Buscar classificados de cada grupo
    const classificados = await prisma.classificacaoGrupo.findMany({
        where: {
            grupo: { campeonatoId },
            posicao: { lte: 2 } // Top 2 de cada grupo
        },
        include: {
            time: true,
            grupo: true
        },
        orderBy: [
            { grupo: { ordem: 'asc' } },
            { posicao: 'asc' }
        ]
    })

    // Gerar confrontos de playoffs (implementação básica)
    const jogosPlayoffs = []
    const dataBase = new Date()
    dataBase.setDate(dataBase.getDate() + 7) // Playoffs começam na próxima semana

    for (let i = 0; i < classificados.length; i += 2) {
        if (classificados[i + 1]) {
            jogosPlayoffs.push({
                campeonatoId,
                timeCasaId: classificados[i].timeId,
                timeVisitanteId: classificados[i + 1].timeId,
                dataJogo: new Date(dataBase),
                rodada: 1,
                fase: 'QUARTAS',
                status: 'AGENDADO'
            })
        }
    }

    if (jogosPlayoffs.length > 0) {
        await prisma.jogo.createMany({
            data: jogosPlayoffs
        })
    }

    return jogosPlayoffs.length
}