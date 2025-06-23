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