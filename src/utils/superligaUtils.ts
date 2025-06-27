import { PrismaClient } from '@prisma/client'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA } from '../types'

const prisma = new PrismaClient()


interface TimeClassificado {
    timeId: number
    time: {
        id: number
        nome: string
        sigla: string
        logo: string
    }
    vitorias: number
    pontosPro: number
    pontosContra: number
    saldo: number
    regional: string
    regionalTipo: string
    posicaoRegional: number
}


export async function gerarPlayoffsSudeste(campeonatoId: number, conferenciaId: number) {
    try {
        const grupos = await prisma.grupo.findMany({
            where: {
                campeonatoId,
                regional: {
                    conferencia: { id: conferenciaId }
                }
            },
            include: {
                times: {
                    include: {
                        time: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                logo: true
                            }
                        }
                    }
                },
                regional: {
                    include: { conferencia: true }
                }
            }
        })

        if (grupos.length === 0) {
            throw new Error('Nenhum grupo encontrado para a conferência Sudeste')
        }

        const classificacoesPorRegional: { [key: string]: TimeClassificado[] } = {}

        for (const grupo of grupos) {
            const classificacaoGrupo: TimeClassificado[] = []

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
                    }
                })

                const timeClassificado: TimeClassificado = {
                    timeId: grupoTime.timeId,
                    time: grupoTime.time,
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra,
                    regional: grupo.regional?.nome || 'Desconhecido',
                    regionalTipo: grupo.regional?.tipo || 'DESCONHECIDO',
                    posicaoRegional: 0 
                }

                classificacaoGrupo.push(timeClassificado)
            }

            classificacaoGrupo.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacaoGrupo.forEach((item, index) => {
                item.posicaoRegional = index + 1
            })

            if (grupo.regional?.nome) {
                classificacoesPorRegional[grupo.regional.nome] = classificacaoGrupo
            }
        }

        const primeirosColocados: TimeClassificado[] = []
        const segundosColocados: TimeClassificado[] = []

        Object.keys(classificacoesPorRegional).forEach(regional => {
            const classificacao = classificacoesPorRegional[regional]
            if (classificacao[0]) primeirosColocados.push(classificacao[0])
            if (classificacao[1]) segundosColocados.push(classificacao[1])
        })

        primeirosColocados.sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
        })

        segundosColocados.sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
        })

        if (primeirosColocados.length < 3) {
            throw new Error(`Insuficientes primeiros colocados para playoffs Sudeste. Encontrados: ${primeirosColocados.length}, necessários: 3`)
        }

        if (segundosColocados.length < 3) {
            throw new Error(`Insuficientes segundos colocados para playoffs Sudeste. Encontrados: ${segundosColocados.length}, necessários: 3`)
        }

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sudeste 1: 3º Melhor 1º × 3º Melhor 2º',
                timeClassificado1Id: primeirosColocados[2].timeId,
                timeClassificado2Id: segundosColocados[2].timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sudeste 2: 1º Melhor 2º × 2º Melhor 2º',
                timeClassificado1Id: segundosColocados[0].timeId,
                timeClassificado2Id: segundosColocados[1].timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sudeste 1: 1º Melhor 1º × Vencedor WC',
                timeClassificado1Id: primeirosColocados[0].timeId,
                timeClassificado2Id: null,
                jogoAnterior1Id: null,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sudeste 2: 2º Melhor 1º × Vencedor WC',
                timeClassificado1Id: primeirosColocados[1].timeId,
                timeClassificado2Id: null, 
                jogoAnterior1Id: null,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Sudeste',
                timeClassificado1Id: null,
                timeClassificado2Id: null,
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: primeirosColocados.slice(0, 2), 
                wildcards: [
                    primeirosColocados[2], 
                    ...segundosColocados   
                ]
            },
            estatisticas: {
                totalRegionais: Object.keys(classificacoesPorRegional).length,
                primeirosColocados: primeirosColocados.length,
                segundosColocados: segundosColocados.length,
                jogosGerados: 5 
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Sudeste:', error)
        throw error
    }
}


export async function gerarPlayoffsSul(campeonatoId: number, conferenciaId: number) {
    try {
        const grupos = await prisma.grupo.findMany({
            where: {
                campeonatoId,
                regional: {
                    conferencia: { id: conferenciaId }
                }
            },
            include: {
                times: {
                    include: { time: true }
                },
                regional: true
            }
        })

        const grupoAraucaria = grupos.find(g => g.regional?.tipo === 'ARAUCARIA')
        const grupoPampa = grupos.find(g => g.regional?.tipo === 'PAMPA')

        if (!grupoAraucaria || !grupoPampa) {
            throw new Error('Regionais Araucária ou Pampa não encontrados')
        }

        const calcularClassificacao = async (grupo: any) => {
            const classificacao = []

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
                    }
                })

                classificacao.push({
                    timeId: grupoTime.timeId,
                    time: grupoTime.time,
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra
                })
            }

            classificacao.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            return classificacao
        }

        const classificacaoAraucaria = await calcularClassificacao(grupoAraucaria)
        const classificacaoPampa = await calcularClassificacao(grupoPampa)

        const primeiroAraucaria = classificacaoAraucaria[0]
        const primeiroPampa = classificacaoPampa[0]
        const segundoAraucaria = classificacaoAraucaria[1]
        const segundoPampa = classificacaoPampa[1]
        const terceiroAraucaria = classificacaoAraucaria[2]
        const terceiroPampa = classificacaoPampa[2]

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
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
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
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
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sul 1: 1º Araucária × Vencedor WC',
                timeClassificado1Id: primeiroAraucaria?.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sul 2: 1º Pampa × Vencedor WC',
                timeClassificado1Id: primeiroPampa?.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Sul',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroAraucaria, primeiroPampa],
                wildcards: [segundoAraucaria, segundoPampa, terceiroAraucaria, terceiroPampa]
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Sul:', error)
        throw error
    }
}

export async function gerarPlayoffsNordeste(campeonatoId: number, conferenciaId: number) {
    try {
        const grupo = await prisma.grupo.findFirst({
            where: {
                campeonatoId,
                regional: {
                    conferencia: { id: conferenciaId }
                }
            },
            include: {
                times: {
                    include: { time: true }
                }
            }
        })

        if (!grupo) {
            throw new Error('Regional Atlântico não encontrado')
        }

        const classificacao = []

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
                }
            })

            classificacao.push({
                timeId: grupoTime.timeId,
                time: grupoTime.time,
                vitorias,
                pontosPro,
                pontosContra,
                saldo: pontosPro - pontosContra
            })
        }

        classificacao.sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
        })

        const primeiro = classificacao[0]
        const segundo = classificacao[1]
        const terceiro = classificacao[2]
        const quarto = classificacao[3]
        const quinto = classificacao[4]
        const sexto = classificacao[5]

        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Nordeste 1: 3º × 6º Colocado',
                timeClassificado1Id: terceiro?.timeId,
                timeClassificado2Id: sexto?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Nordeste 2: 4º × 5º Colocado',
                timeClassificado1Id: quarto?.timeId,
                timeClassificado2Id: quinto?.timeId,
                dataJogo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Nordeste 1: 1º Colocado × Vencedor WC',
                timeClassificado1Id: primeiro?.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Nordeste 2: 2º Colocado × Vencedor WC',
                timeClassificado1Id: segundo?.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Nordeste',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [wildCard1, wildCard2],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiro, segundo],
                wildcards: [terceiro, quarto, quinto, sexto]
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Nordeste:', error)
        throw error
    }
}


export async function gerarPlayoffsCentroNorte(campeonatoId: number, conferenciaId: number) {
    try {
        const grupos = await prisma.grupo.findMany({
            where: {
                campeonatoId,
                regional: {
                    conferencia: { id: conferenciaId }
                }
            },
            include: {
                times: {
                    include: { time: true }
                },
                regional: true
            }
        })

        const grupoCerrado = grupos.find(g => g.regional?.tipo === 'CERRADO')
        const grupoAmazonia = grupos.find(g => g.regional?.tipo === 'AMAZONIA')

        if (!grupoCerrado || !grupoAmazonia) {
            throw new Error('Regionais Cerrado ou Amazônia não encontrados')
        }

        const calcularClassificacao = async (grupo: any) => {
            const classificacao = []

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
                    }
                })

                classificacao.push({
                    timeId: grupoTime.timeId,
                    time: grupoTime.time,
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra
                })
            }

            classificacao.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            return classificacao
        }

        const classificacaoCerrado = await calcularClassificacao(grupoCerrado)
        const classificacaoAmazonia = await calcularClassificacao(grupoAmazonia)

        const primeiroCerrado = classificacaoCerrado[0]
        const segundoCerrado = classificacaoCerrado[1]
        const primeiroAmazonia = classificacaoAmazonia[0]
        const segundoAmazonia = classificacaoAmazonia[1]

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
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
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 2: 1º Cerrado × 2º Amazônia',
                timeClassificado1Id: primeiroCerrado?.timeId,
                timeClassificado2Id: segundoAmazonia?.timeId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Centro-Norte',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [], 
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroCerrado, primeiroAmazonia, segundoCerrado, segundoAmazonia],
                wildcards: []
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Centro-Norte:', error)
        throw error
    }
}


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

export async function distribuirTimesAutomaticamente(campeonatoId: number, temporada: string) {
    try {
        const times = await prisma.time.findMany({
            where: { temporada }
        })

        if (times.length !== 32) {
            throw new Error(`Superliga precisa de exatamente 32 times. Encontrados: ${times.length}`)
        }

        const conferencias = []
        let ordemConferencia = 1

        for (const confConfig of SUPERLIGA_CONFIG) {
            const conferencia = await prisma.conferencia.create({
                data: {
                    nome: confConfig.nome,
                    tipo: confConfig.tipo,
                    icone: confConfig.icone,
                    campeonatoId,
                    ordem: ordemConferencia, 
                    totalTimes: confConfig.totalTimes
                }
            })

            let ordemRegional = 1
            for (const regConfig of confConfig.regionais) {
                const regional = await prisma.regional.create({
                    data: {
                        nome: regConfig.nome,
                        tipo: regConfig.tipo,
                        conferenciaId: conferencia.id,
                        ordem: ordemRegional,
                        timesPorRegional: regConfig.timesPorRegional
                    }
                })

                const grupo = await prisma.grupo.create({
                    data: {
                        nome: `Grupo ${regConfig.nome}`,
                        campeonatoId,
                        regionalId: regional.id,
                        ordem: ordemRegional 
                    }
                })

                const timesDoRegional = TIMES_SUPERLIGA[regConfig.tipo as keyof typeof TIMES_SUPERLIGA] || []

                for (const nomeTime of timesDoRegional) {
                    const time = times.find(t => t.nome === nomeTime)
                    if (time) {
                        await prisma.grupoTime.create({
                            data: {
                                grupoId: grupo.id,
                                timeId: time.id
                            }
                        })
                    } else {
                        console.warn(`Time "${nomeTime}" não encontrado na temporada ${temporada}`)
                    }
                }

                ordemRegional++
            }

            conferencias.push(conferencia)
            ordemConferencia++
        }

        const totalRegionais = conferencias.reduce((acc, c) => {
            const confConfig = SUPERLIGA_CONFIG.find(sc => sc.tipo === c.tipo)
            return acc + (confConfig?.regionais.length || 0)
        }, 0)

        const timesDistribuidos = await prisma.grupoTime.count({
            where: {
                grupo: { campeonatoId }
            }
        })

        return {
            conferencias: conferencias.length,
            regionais: totalRegionais,
            timesDistribuidos,
            detalhes: {
                sudeste: {
                    regionais: SUPERLIGA_CONFIG.find(c => c.tipo === 'SUDESTE')?.regionais.length || 0,
                    times: SUPERLIGA_CONFIG.find(c => c.tipo === 'SUDESTE')?.totalTimes || 0
                },
                sul: {
                    regionais: SUPERLIGA_CONFIG.find(c => c.tipo === 'SUL')?.regionais.length || 0,
                    times: SUPERLIGA_CONFIG.find(c => c.tipo === 'SUL')?.totalTimes || 0
                },
                nordeste: {
                    regionais: SUPERLIGA_CONFIG.find(c => c.tipo === 'NORDESTE')?.regionais.length || 0,
                    times: SUPERLIGA_CONFIG.find(c => c.tipo === 'NORDESTE')?.totalTimes || 0
                },
                centroNorte: {
                    regionais: SUPERLIGA_CONFIG.find(c => c.tipo === 'CENTRO_NORTE')?.regionais.length || 0,
                    times: SUPERLIGA_CONFIG.find(c => c.tipo === 'CENTRO_NORTE')?.totalTimes || 0
                }
            }
        }
    } catch (error) {
        console.error('Erro ao distribuir times:', error)
        throw error
    }
}

export async function gerarFaseNacional(campeonatoId: number) {
    try {
        const finaisConferencia = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                fase: 'FINAL_CONFERENCIA'
            },
            include: {
                timeVencedor: true,
                conferencia: true
            }
        })

        if (finaisConferencia.length !== 4) {
            throw new Error('Nem todas as conferências finalizaram seus playoffs')
        }

        const finalizadas = finaisConferencia.filter(f => f.status === 'FINALIZADO')
        if (finalizadas.length !== 4) {
            throw new Error('Nem todas as finais de conferência foram finalizadas')
        }

        const campeaoSudeste = finalizadas.find(f => f.conferencia?.tipo === 'SUDESTE')
        const campeaoSul = finalizadas.find(f => f.conferencia?.tipo === 'SUL')
        const campeaoNordeste = finalizadas.find(f => f.conferencia?.tipo === 'NORDESTE')
        const campeaoCentroNorte = finalizadas.find(f => f.conferencia?.tipo === 'CENTRO_NORTE')

        const semifinalNacional1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: null, 
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 1,
                nome: 'Semifinal Nacional 1: Campeão Sul × Campeão Sudeste',
                timeClassificado1Id: campeaoSul?.timeVencedorId,
                timeClassificado2Id: campeaoSudeste?.timeVencedorId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const semifinalNacional2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: null,
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 1,
                nome: 'Semifinal Nacional 2: Campeão Nordeste × Campeão Centro-Norte',
                timeClassificado1Id: campeaoNordeste?.timeVencedorId,
                timeClassificado2Id: campeaoCentroNorte?.timeVencedorId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGENDADO'
            }
        })

        const finalNacional = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId: null,
                fase: 'FINAL_NACIONAL',
                rodada: 1,
                nome: 'Grande Decisão Nacional',
                jogoAnterior1Id: semifinalNacional1.id,
                jogoAnterior2Id: semifinalNacional2.id,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            semifinais: [semifinalNacional1, semifinalNacional2],
            final: finalNacional,
            campeoes: {
                sudeste: campeaoSudeste?.timeVencedor,
                sul: campeaoSul?.timeVencedor,
                nordeste: campeaoNordeste?.timeVencedor,
                centroNorte: campeaoCentroNorte?.timeVencedor
            }
        }
    } catch (error) {
        console.error('Erro ao gerar fase nacional:', error)
        throw error
    }
}