import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ==================== UTILITÁRIOS GERAIS ====================

interface TimeClassificado {
    timeId: number
    nome: string
    sigla: string
    posicaoRegional: number
    pontos: number
    saldoPontos: number
    pontosPro: number
    regional: string
    grupoId: number
}

async function getTimesClassificadosPorConferencia(campeonatoId: number, conferenciaId: number) {
    const classificacao = await prisma.classificacaoGrupo.findMany({
        where: {
            grupo: {
                campeonatoId,
                regional: {
                    conferenciaId
                }
            }
        },
        include: {
            time: {
                select: { id: true, nome: true, sigla: true, logo: true }
            },
            grupo: {
                include: {
                    regional: {
                        select: { nome: true, tipo: true }
                    }
                }
            }
        },
        orderBy: [
            { grupo: { ordem: 'asc' } },
            { posicao: 'asc' }
        ]
    })

    return classificacao.map(c => ({
        timeId: c.timeId,
        nome: c.time.nome,
        sigla: c.time.sigla,
        posicaoRegional: c.posicao,
        pontos: c.pontos,
        saldoPontos: c.saldoPontos,
        pontosPro: c.pontosPro,
        regional: c.grupo.regional?.nome || '',
        grupoId: c.grupoId
    }))
}

// ==================== PLAYOFFS CONFERÊNCIA SUDESTE ====================

export async function gerarPlayoffsSudeste(campeonatoId: number) {
    try {
        const conferenciaSudeste = await prisma.conferencia.findFirst({
            where: {
                campeonatoId,
                tipo: 'SUDESTE'
            }
        })

        if (!conferenciaSudeste) {
            throw new Error('Conferência Sudeste não encontrada')
        }

        const times = await getTimesClassificadosPorConferencia(campeonatoId, conferenciaSudeste.id)
        
        const primeirosColocados = times.filter(t => t.posicaoRegional === 1)
        const segundosColocados = times.filter(t => t.posicaoRegional === 2)
        const terceirosColocados = times.filter(t => t.posicaoRegional === 3)

        primeirosColocados.sort((a, b) => {
            if (b.pontos !== a.pontos) return b.pontos - a.pontos
            if (b.saldoPontos !== a.saldoPontos) return b.saldoPontos - a.saldoPontos
            return b.pontosPro - a.pontosPro
        })

        segundosColocados.sort((a, b) => {
            if (b.pontos !== a.pontos) return b.pontos - a.pontos
            if (b.saldoPontos !== a.saldoPontos) return b.saldoPontos - a.saldoPontos
            return b.pontosPro - a.pontosPro
        })

        terceirosColocados.sort((a, b) => {
            if (b.pontos !== a.pontos) return b.pontos - a.pontos
            if (b.saldoPontos !== a.saldoPontos) return b.saldoPontos - a.saldoPontos
            return b.pontosPro - a.pontosPro
        })

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSudeste.id,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sudeste 1: 3º Melhor 1º × 3º Melhor 2º',
                timeClassificado1Id: primeirosColocados[2]?.timeId,
                timeClassificado2Id: segundosColocados[2]?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSudeste.id,
                fase: 'WILD_CARD',
                rodada: 2,
                nome: 'Wild Card Sudeste 2: 1º Melhor 2º × 2º Melhor 2º',
                timeClassificado1Id: segundosColocados[0]?.timeId,
                timeClassificado2Id: segundosColocados[1]?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSudeste.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 1,
                nome: 'Semifinal Sudeste 1: 1º Melhor 1º × Vencedor WC Mais Próximo',
                timeClassificado1Id: primeirosColocados[0]?.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSudeste.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 2,
                nome: 'Semifinal Sudeste 2: 2º Melhor 1º × Vencedor WC Mais Próximo',
                timeClassificado1Id: primeirosColocados[1]?.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const finalConferencia = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSudeste.id,
                fase: 'FINAL_CONF',
                rodada: 1,
                nome: 'Final Sudeste',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            conferencia: 'SUDESTE',
            wildCards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final: finalConferencia,
            timesClassificados: {
                diretos: primeirosColocados.slice(0, 2),
                wildCards: [primeirosColocados[2], ...segundosColocados]
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Sudeste:', error)
        throw error
    }
}

// ==================== PLAYOFFS CONFERÊNCIA SUL ====================

export async function gerarPlayoffsSul(campeonatoId: number) {
    try {
        const conferenciaSul = await prisma.conferencia.findFirst({
            where: {
                campeonatoId,
                tipo: 'SUL'
            }
        })

        if (!conferenciaSul) {
            throw new Error('Conferência Sul não encontrada')
        }

        const times = await getTimesClassificadosPorConferencia(campeonatoId, conferenciaSul.id)
        
        const araucaria = times.filter(t => t.regional.includes('Araucária'))
        const pampa = times.filter(t => t.regional.includes('Pampa'))

        const primeiroAraucaria = araucaria.find(t => t.posicaoRegional === 1)
        const primeiroPampa = pampa.find(t => t.posicaoRegional === 1)
        const segundoAraucaria = araucaria.find(t => t.posicaoRegional === 2)
        const segundoPampa = pampa.find(t => t.posicaoRegional === 2)
        const terceiroAraucaria = araucaria.find(t => t.posicaoRegional === 3)
        const terceiroPampa = pampa.find(t => t.posicaoRegional === 3)

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSul.id,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sul 1: 2º Araucária × 3º Pampa',
                timeClassificado1Id: segundoAraucaria?.timeId,
                timeClassificado2Id: terceiroPampa?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSul.id,
                fase: 'WILD_CARD',
                rodada: 2,
                nome: 'Wild Card Sul 2: 2º Pampa × 3º Araucária',
                timeClassificado1Id: segundoPampa?.timeId,
                timeClassificado2Id: terceiroAraucaria?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSul.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 1,
                nome: 'Semifinal Sul 1: 1º Araucária × Vencedor WC Mais Próximo',
                timeClassificado1Id: primeiroAraucaria?.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSul.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 2,
                nome: 'Semifinal Sul 2: 1º Pampa × Vencedor WC Mais Próximo',
                timeClassificado1Id: primeiroPampa?.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const finalConferencia = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaSul.id,
                fase: 'FINAL_CONF',
                rodada: 1,
                nome: 'Final Sul',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            conferencia: 'SUL',
            wildCards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final: finalConferencia,
            timesClassificados: {
                diretos: [primeiroAraucaria, primeiroPampa],
                wildCards: [segundoAraucaria, segundoPampa, terceiroAraucaria, terceiroPampa]
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Sul:', error)
        throw error
    }
}

// ==================== PLAYOFFS CONFERÊNCIA NORDESTE ====================

export async function gerarPlayoffsNordeste(campeonatoId: number) {
    try {
        const conferenciaNordeste = await prisma.conferencia.findFirst({
            where: {
                campeonatoId,
                tipo: 'NORDESTE'
            }
        })

        if (!conferenciaNordeste) {
            throw new Error('Conferência Nordeste não encontrada')
        }

        const times = await getTimesClassificadosPorConferencia(campeonatoId, conferenciaNordeste.id)
        
        times.sort((a, b) => a.posicaoRegional - b.posicaoRegional)

        const primeiro = times[0]
        const segundo = times[1]
        const terceiro = times[2]
        const quarto = times[3]
        const quinto = times[4]
        const sexto = times[5]

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaNordeste.id,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Nordeste 1: 3º × 6º',
                timeClassificado1Id: terceiro?.timeId,
                timeClassificado2Id: sexto?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaNordeste.id,
                fase: 'WILD_CARD',
                rodada: 2,
                nome: 'Wild Card Nordeste 2: 4º × 5º',
                timeClassificado1Id: quarto?.timeId,
                timeClassificado2Id: quinto?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaNordeste.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 1,
                nome: 'Semifinal Nordeste 1: 1º × Vencedor WC Mais Próximo',
                timeClassificado1Id: primeiro?.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaNordeste.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 2,
                nome: 'Semifinal Nordeste 2: 2º × Vencedor WC Mais Próximo',
                timeClassificado1Id: segundo?.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const finalConferencia = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaNordeste.id,
                fase: 'FINAL_CONF',
                rodada: 1,
                nome: 'Final Nordeste',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            conferencia: 'NORDESTE',
            wildCards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final: finalConferencia,
            timesClassificados: {
                diretos: [primeiro, segundo],
                wildCards: [terceiro, quarto, quinto, sexto]
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Nordeste:', error)
        throw error
    }
}

// ==================== PLAYOFFS CONFERÊNCIA CENTRO-NORTE ====================

export async function gerarPlayoffsCentroNorte(campeonatoId: number) {
    try {
        const conferenciaCentroNorte = await prisma.conferencia.findFirst({
            where: {
                campeonatoId,
                tipo: 'CENTRO_NORTE'
            }
        })

        if (!conferenciaCentroNorte) {
            throw new Error('Conferência Centro-Norte não encontrada')
        }

        const times = await getTimesClassificadosPorConferencia(campeonatoId, conferenciaCentroNorte.id)
        
        const cerrado = times.filter(t => t.regional.includes('Cerrado'))
        const amazonia = times.filter(t => t.regional.includes('Amazônia'))

        const primeiroCerrado = cerrado.find(t => t.posicaoRegional === 1)
        const primeiroAmazonia = amazonia.find(t => t.posicaoRegional === 1)
        const segundoCerrado = cerrado.find(t => t.posicaoRegional === 2)
        const segundoAmazonia = amazonia.find(t => t.posicaoRegional === 2)

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaCentroNorte.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 1: 1º Amazônia × 2º Cerrado',
                timeClassificado1Id: primeiroAmazonia?.timeId,
                timeClassificado2Id: segundoCerrado?.timeId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaCentroNorte.id,
                fase: 'SEMIFINAL_CONF',
                rodada: 2,
                nome: 'Semifinal Centro-Norte 2: 1º Cerrado × 2º Amazônia',
                timeClassificado1Id: primeiroCerrado?.timeId,
                timeClassificado2Id: segundoAmazonia?.timeId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const finalConferencia = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: conferenciaCentroNorte.id,
                fase: 'FINAL_CONF',
                rodada: 1,
                nome: 'Final Centro-Norte',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            conferencia: 'CENTRO_NORTE',
            wildCards: [],
            semifinais: [semifinal1, semifinal2],
            final: finalConferencia,
            timesClassificados: {
                diretos: [primeiroCerrado, primeiroAmazonia, segundoCerrado, segundoAmazonia],
                wildCards: []
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Centro-Norte:', error)
        throw error
    }
}

// ==================== UTILITÁRIOS PARA AVANÇO DE PLAYOFFS ====================

export async function atualizarProximaFase(jogoFinalizadoId: number) {
    try {
        const jogoFinalizado = await prisma.playoffJogo.findUnique({
            where: { id: jogoFinalizadoId },
            include: { timeVencedor: true }
        })

        if (!jogoFinalizado || !jogoFinalizado.timeVencedor) {
            throw new Error('Jogo não finalizado ou sem vencedor definido')
        }

        const jogosProximos = await prisma.playoffJogo.findMany({
            where: {
                OR: [
                    { jogoAnterior1Id: jogoFinalizadoId },
                    { jogoAnterior2Id: jogoFinalizadoId }
                ]
            }
        })

        for (const proximoJogo of jogosProximos) {
            const updateData: any = {}

            if (proximoJogo.jogoAnterior1Id === jogoFinalizadoId) {
                updateData.timeClassificado1Id = jogoFinalizado.timeVencedorId
            }
            
            if (proximoJogo.jogoAnterior2Id === jogoFinalizadoId) {
                updateData.timeClassificado2Id = jogoFinalizado.timeVencedorId
            }

            if (proximoJogo.timeClassificado1Id || updateData.timeClassificado1Id) {
                if (proximoJogo.timeClassificado2Id || updateData.timeClassificado2Id) {
                    updateData.status = 'AGENDADO'
                }
            }

            await prisma.playoffJogo.update({
                where: { id: proximoJogo.id },
                data: updateData
            })
        }

        return jogosProximos.length
    } catch (error) {
        console.error('Erro ao atualizar próxima fase:', error)
        throw error
    }
}

// ==================== VALIDAÇÕES ====================

export async function validarTimesClassificados(campeonatoId: number) {
    try {
        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                regionais: {
                    include: {
                        grupos: {
                            include: {
                                times: {
                                    include: { time: true }
                                },
                                classificacoes: {
                                    orderBy: { posicao: 'asc' }
                                }
                            }
                        }
                    }
                }
            }
        })

        const validacao = {
            valida: true,
            erros: [] as string[],
            detalhes: {} as any
        }

        for (const conferencia of conferencias) {
            const timesConferencia = conferencia.regionais.reduce((acc, regional) => {
                return acc + regional.grupos.reduce((acc2, grupo) => acc2 + grupo.times.length, 0)
            }, 0)

            validacao.detalhes[conferencia.tipo] = {
                timesEsperados: conferencia.totalTimes,
                timesEncontrados: timesConferencia,
                regionais: conferencia.regionais.length
            }

            if (timesConferencia !== conferencia.totalTimes) {
                validacao.valida = false
                validacao.erros.push(
                    `Conferência ${conferencia.nome}: esperados ${conferencia.totalTimes} times, encontrados ${timesConferencia}`
                )
            }
        }

        return validacao
    } catch (error) {
        console.error('Erro ao validar times classificados:', error)
        throw error
    }
}

// ==================== ESTATÍSTICAS ====================

export async function getEstatisticasPlayoffs(campeonatoId: number) {
    try {
        const totalJogos = await prisma.playoffJogo.count({
            where: { campeonatoId }
        })

        const jogosFinalizados = await prisma.playoffJogo.count({
            where: {
                campeonatoId,
                status: 'FINALIZADO'
            }
        })

        const jogosPorFase = await prisma.playoffJogo.groupBy({
            by: ['fase'],
            where: { campeonatoId },
            _count: {
                id: true
            }
        })

        return {
            totalJogos,
            jogosFinalizados,
            progresso: totalJogos > 0 ? (jogosFinalizados / totalJogos) * 100 : 0,
            jogosPorFase: jogosPorFase.map(j => ({
                fase: j.fase,
                total: j._count.id
            }))
        }
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error)
        throw error
    }
}

// ==================== LIMPEZA E RESET ====================

export async function limparPlayoffsCampeonato(campeonatoId: number) {
    try {
        const jogosRemovidos = await prisma.playoffJogo.deleteMany({
            where: { campeonatoId }
        })

        await prisma.campeonato.update({
            where: { id: campeonatoId },
            data: { 
                status: 'EM_ANDAMENTO'
            }
        })

        return {
            message: 'Playoffs limpos com sucesso',
            jogosRemovidos: jogosRemovidos.count
        }
    } catch (error) {
        console.error('Erro ao limpar playoffs:', error)
        throw error
    }
}

// ==================== SIMULAÇÃO ====================

export async function simularResultadosPlayoffs(campeonatoId: number) {
    try {
        const jogosPlayoff = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                status: { in: ['AGENDADO', 'AGUARDANDO'] }
            },
            orderBy: [
                { fase: 'asc' },
                { rodada: 'asc' }
            ]
        })

        const resultadosSimulados = []

        for (const jogo of jogosPlayoff) {
            const placarTime1 = Math.floor(Math.random() * 35) + 7
            const placarTime2 = Math.floor(Math.random() * 35) + 7
            
            const placarFinal1 = placarTime1 === placarTime2 ? placarTime1 + 1 : placarTime1
            const placarFinal2 = placarTime2
            
            const timeVencedorId = placarFinal1 > placarFinal2 ? 
                jogo.timeClassificado1Id : 
                jogo.timeClassificado2Id

            const jogoAtualizado = await prisma.playoffJogo.update({
                where: { id: jogo.id },
                data: {
                    placarTime1: placarFinal1,
                    placarTime2: placarFinal2,
                    timeVencedorId,
                    status: 'FINALIZADO'
                }
            })

            resultadosSimulados.push(jogoAtualizado)
            await atualizarProximaFase(jogo.id)
        }

        return {
            message: 'Playoffs simulados com sucesso!',
            jogosSimulados: resultadosSimulados.length,
            resultados: resultadosSimulados
        }
    } catch (error) {
        console.error('Erro ao simular playoffs:', error)
        throw error
    }
}