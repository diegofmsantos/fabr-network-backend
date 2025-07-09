import { PrismaClient } from '@prisma/client'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA } from '../types'
import { calcularClassificacaoPorConferencia } from './distribuicaoUtils'

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

export async function distribuirTimesAutomaticamente(campeonatoId: number, temporada: string) {
    try {
        console.log(`Iniciando distribuição automática de times para a temporada ${temporada}`)

        // Buscar todos os times da temporada
        const todosTimes = await prisma.time.findMany({
            where: { temporada }
        })

        console.log(`Encontrados ${todosTimes.length} times para distribuir`)

        if (todosTimes.length !== 32) {
            throw new Error(`Esperados 32 times, encontrados ${todosTimes.length}`)
        }

        // Verificar se os times estão corretos conforme a configuração
        let timesDistribuidos = 0

        for (const [regionalTipo, timesEsperados] of Object.entries(TIMES_SUPERLIGA)) {
            const timesEncontrados = todosTimes.filter(time =>
                timesEsperados.includes(time.nome)
            )

            if (timesEncontrados.length !== timesEsperados.length) {
                throw new Error(`Regional ${regionalTipo}: esperados ${timesEsperados.length} times, encontrados ${timesEncontrados.length}`)
            }

            timesDistribuidos += timesEncontrados.length
            console.log(`Regional ${regionalTipo}: ${timesEncontrados.length} times validados`)
        }

        console.log(`Distribuição automática concluída: ${timesDistribuidos} times distribuídos`)

        return {
            timesDistribuidos,
            regionaisConfigurados: Object.keys(TIMES_SUPERLIGA).length,
            status: 'SUCESSO'
        }

    } catch (error) {
        console.error('Erro na distribuição automática:', error)
        throw error
    }
}

export async function gerarPlayoffsSudeste(campeonatoId: number, conferenciaId: number) {
    try {
        // Buscar regionais da conferência Sudeste
        const regionais = await prisma.regional.findMany({
            where: { conferenciaId },
            include: { conferencia: true }
        })

        const regionalSerramar = regionais.find(r => r.tipo === 'SERRAMAR')
        const regionalCanastra = regionais.find(r => r.tipo === 'CANASTRA')
        const regionalCantareira = regionais.find(r => r.tipo === 'CANTAREIRA')

        if (!regionalSerramar || !regionalCanastra || !regionalCantareira) {
            throw new Error('Regionais do Sudeste não encontrados')
        }

        // Buscar temporada
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            select: { temporada: true }
        })

        const temporada = campeonato?.temporada

        if (!temporada) {
            throw new Error('Temporada do campeonato não encontrada')
        }

        const calcularClassificacaoRegional = async (regionalTipo: string) => {
            const timesEsperados = TIMES_SUPERLIGA[regionalTipo as keyof typeof TIMES_SUPERLIGA]
            const times = await prisma.time.findMany({
                where: {
                    nome: { in: timesEsperados },
                    temporada
                }
            })

            const classificacao = []

            for (const time of times) {
                const jogos = await prisma.jogo.findMany({
                    where: {
                        campeonatoId,
                        OR: [
                            { timeCasaId: time.id },
                            { timeVisitanteId: time.id }
                        ],
                        status: 'FINALIZADO'
                    }
                })

                let vitorias = 0
                let pontosPro = 0
                let pontosContra = 0

                jogos.forEach(jogo => {
                    const isTimeCasa = jogo.timeCasaId === time.id
                    const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
                    const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

                    pontosPro += pontosFeitos
                    pontosContra += pontosSofridos

                    if (pontosFeitos > pontosSofridos) {
                        vitorias++
                    }
                })

                const timeClassificado: TimeClassificado = {
                    timeId: time.id,
                    time: {
                        id: time.id,
                        nome: time.nome,
                        sigla: time.sigla,
                        logo: time.logo
                    },
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra,
                    regional: regionalTipo,
                    regionalTipo: regionalTipo,
                    posicaoRegional: 0
                }

                classificacao.push(timeClassificado)
            }

            // Ordenar classificação
            classificacao.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacao.forEach((item, index) => {
                item.posicaoRegional = index + 1
            })

            return classificacao
        }

        const classificacaoCerrado = await calcularClassificacaoRegional('CERRADO')
        const classificacaoAmazonia = await calcularClassificacaoRegional('AMAZONIA')

        const primeiroCerrado = classificacaoCerrado[0]
        const segundoCerrado = classificacaoCerrado[1]

        const primeiroAmazonia = classificacaoAmazonia[0]
        const segundoAmazonia = classificacaoAmazonia[1]

        if (!primeiroCerrado || !primeiroAmazonia) {
            throw new Error('Primeiros colocados dos regionais não encontrados')
        }

        // Criar jogos de Semifinal (Centro-Norte vai direto para semifinal)
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 1',
                timeClassificado1Id: primeiroAmazonia.timeId,
                timeClassificado2Id: segundoCerrado?.timeId,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 2',
                timeClassificado1Id: primeiroCerrado.timeId,
                timeClassificado2Id: segundoAmazonia?.timeId,
                dataJogo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        // Criar Final de Conferência
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Conferência Centro-Norte',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [], // Centro-Norte não tem wild card
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroCerrado, primeiroAmazonia],
                wildcards: [segundoCerrado, segundoAmazonia].filter(Boolean)
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Centro-Norte:', error)
        throw error
    }
}

export async function simularResultadosPlayoffs(campeonatoId: number) {
    try {
        console.log('Simulando resultados dos playoffs...')

        const jogosPlayoffs = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                status: 'AGUARDANDO'
            },
            include: {
                timeClassificado1: true,
                timeClassificado2: true
            },
            orderBy: [
                { fase: 'asc' },
                { rodada: 'asc' }
            ]
        })

        let jogosSimulados = 0

        for (const jogo of jogosPlayoffs) {
            // Simular apenas se ambos os times estão definidos
            if (jogo.timeClassificado1Id && jogo.timeClassificado2Id) {
                const placar1 = Math.floor(Math.random() * 35) + 7 // 7-42 pontos
                const placar2 = Math.floor(Math.random() * 35) + 7

                const vencedorId = placar1 > placar2 ? jogo.timeClassificado1Id : jogo.timeClassificado2Id

                await prisma.playoffJogo.update({
                    where: { id: jogo.id },
                    data: {
                        placarTime1: placar1,
                        placarTime2: placar2,
                        timeVencedorId: vencedorId,
                        status: 'FINALIZADO'
                    }
                })

                // Atualizar próximos jogos se necessário
                const proximosJogos = await prisma.playoffJogo.findMany({
                    where: {
                        OR: [
                            { jogoAnterior1Id: jogo.id },
                            { jogoAnterior2Id: jogo.id }
                        ]
                    }
                })

                for (const proximoJogo of proximosJogos) {
                    if (proximoJogo.jogoAnterior1Id === jogo.id) {
                        await prisma.playoffJogo.update({
                            where: { id: proximoJogo.id },
                            data: { timeClassificado1Id: vencedorId }
                        })
                    } else if (proximoJogo.jogoAnterior2Id === jogo.id) {
                        await prisma.playoffJogo.update({
                            where: { id: proximoJogo.id },
                            data: { timeClassificado2Id: vencedorId }
                        })
                    }
                }

                jogosSimulados++
                console.log(`Jogo simulado: ${jogo.nome} - ${placar1} x ${placar2}`)
            }
        }

        return {
            jogosSimulados,
            message: `${jogosSimulados} jogos de playoffs simulados com sucesso`
        }

    } catch (error) {
        console.error('Erro ao simular playoffs:', error)
        throw error
    }
}

// Função auxiliar para calcular confronto direto entre times
export async function calcularConfrontoDireto(campeonatoId: number, timeId1: number, timeId2: number) {
    const jogos = await prisma.jogo.findMany({
        where: {
            campeonatoId,
            OR: [
                { timeCasaId: timeId1, timeVisitanteId: timeId2 },
                { timeCasaId: timeId2, timeVisitanteId: timeId1 }
            ],
            status: 'FINALIZADO'
        }
    })

    let vitoriasTime1 = 0
    let vitoriasTime2 = 0
    let pontosTime1 = 0
    let pontosTime2 = 0

    jogos.forEach(jogo => {
        const placarTime1 = jogo.timeCasaId === timeId1 ? jogo.placarCasa : jogo.placarVisitante
        const placarTime2 = jogo.timeCasaId === timeId2 ? jogo.placarCasa : jogo.placarVisitante

        pontosTime1 += placarTime1 || 0
        pontosTime2 += placarTime2 || 0

        if ((placarTime1 || 0) > (placarTime2 || 0)) {
            if (jogo.timeCasaId === timeId1) vitoriasTime1++
            else vitoriasTime2++
        } else {
            if (jogo.timeCasaId === timeId2) vitoriasTime2++
            else vitoriasTime1++
        }
    })

    return {
        jogos: jogos.length,
        vitoriasTime1,
        vitoriasTime2,
        pontosTime1,
        pontosTime2,
        saldoTime1: pontosTime1 - pontosTime2
    }
}

// Função para resetar playoffs
export async function resetarPlayoffs(campeonatoId: number) {
    try {
        const jogosRemovidos = await prisma.playoffJogo.deleteMany({
            where: { campeonatoId }
        })

        return {
            jogosRemovidos: jogosRemovidos.count,
            message: 'Playoffs resetados com sucesso'
        }
    } catch (error) {
        console.error('Erro ao resetar playoffs:', error)
        throw error
    }
}

// Função para obter status dos playoffs

export async function gerarPlayoffsSul(campeonatoId: number, conferenciaId: number) {
    try {
        // Buscar regionais da conferência Sul
        const regionais = await prisma.regional.findMany({
            where: { conferenciaId },
            include: { conferencia: true }
        })

        const regionalAraucaria = regionais.find(r => r.tipo === 'ARAUCARIA')
        const regionalPampa = regionais.find(r => r.tipo === 'PAMPA')

        if (!regionalAraucaria || !regionalPampa) {
            throw new Error('Regionais Araucária ou Pampa não encontrados')
        }

        // Buscar temporada
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            select: { temporada: true }
        })

        const temporada = campeonato?.temporada

        if (!temporada) {
            throw new Error('Temporada do campeonato não encontrada')
        }

        const calcularClassificacaoRegional = async (regionalTipo: string) => {
            const timesEsperados = TIMES_SUPERLIGA[regionalTipo as keyof typeof TIMES_SUPERLIGA]
            const times = await prisma.time.findMany({
                where: {
                    nome: { in: timesEsperados },
                    temporada
                }
            })

            const classificacao = []

            for (const time of times) {
                const jogos = await prisma.jogo.findMany({
                    where: {
                        campeonatoId,
                        OR: [
                            { timeCasaId: time.id },
                            { timeVisitanteId: time.id }
                        ],
                        status: 'FINALIZADO'
                    }
                })

                let vitorias = 0
                let pontosPro = 0
                let pontosContra = 0

                jogos.forEach(jogo => {
                    const isTimeCasa = jogo.timeCasaId === time.id
                    const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
                    const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

                    pontosPro += pontosFeitos
                    pontosContra += pontosSofridos

                    if (pontosFeitos > pontosSofridos) {
                        vitorias++
                    }
                })

                const timeClassificado: TimeClassificado = {
                    timeId: time.id,
                    time: {
                        id: time.id,
                        nome: time.nome,
                        sigla: time.sigla,
                        logo: time.logo
                    },
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra,
                    regional: regionalTipo,
                    regionalTipo: regionalTipo,
                    posicaoRegional: 0
                }

                classificacao.push(timeClassificado)
            }

            // Ordenar classificação
            classificacao.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacao.forEach((item, index) => {
                item.posicaoRegional = index + 1
            })

            return classificacao
        }

        const classificacaoAraucaria = await calcularClassificacaoRegional('ARAUCARIA')
        const classificacaoPampa = await calcularClassificacaoRegional('PAMPA')

        const primeiroAraucaria = classificacaoAraucaria[0]
        const segundoAraucaria = classificacaoAraucaria[1]
        const terceiroAraucaria = classificacaoAraucaria[2]

        const primeiroPampa = classificacaoPampa[0]
        const segundoPampa = classificacaoPampa[1]
        const terceiroPampa = classificacaoPampa[2]

        if (!primeiroAraucaria || !primeiroPampa) {
            throw new Error('Primeiros colocados dos regionais não encontrados')
        }

        // Criar jogos de Wild Card
        const wildCard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sul 1',
                timeClassificado1Id: segundoAraucaria?.timeId,
                timeClassificado2Id: terceiroPampa?.timeId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const wildCard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Sul 2',
                timeClassificado1Id: segundoPampa?.timeId,
                timeClassificado2Id: terceiroAraucaria?.timeId,
                dataJogo: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        // Criar jogos de Semifinal
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sul 1',
                timeClassificado1Id: primeiroAraucaria.timeId,
                jogoAnterior2Id: wildCard1.id,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Sul 2',
                timeClassificado1Id: primeiroPampa.timeId,
                jogoAnterior2Id: wildCard2.id,
                dataJogo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        // Criar Final de Conferência
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Conferência Sul',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
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


export async function gerarPlayoffsCentroNorte(campeonatoId: number, conferenciaId: number) {
    try {
        // Buscar regionais da conferência Centro-Norte
        const regionais = await prisma.regional.findMany({
            where: { conferenciaId },
            include: { conferencia: true }
        })

        const regionalCerrado = regionais.find(r => r.tipo === 'CERRADO')
        const regionalAmazonia = regionais.find(r => r.tipo === 'AMAZONIA')

        if (!regionalCerrado || !regionalAmazonia) {
            throw new Error('Regionais Cerrado ou Amazônia não encontrados')
        }

        // Buscar temporada
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            select: { temporada: true }
        })

        const temporada = campeonato?.temporada

        if (!temporada) {
            throw new Error('Temporada do campeonato não encontrada')
        }

        const calcularClassificacaoRegional = async (regionalTipo: string) => {
            const timesEsperados = TIMES_SUPERLIGA[regionalTipo as keyof typeof TIMES_SUPERLIGA]
            const times = await prisma.time.findMany({
                where: {
                    nome: { in: timesEsperados },
                    temporada
                }
            })

            const classificacao = []

            for (const time of times) {
                const jogos = await prisma.jogo.findMany({
                    where: {
                        campeonatoId,
                        OR: [
                            { timeCasaId: time.id },
                            { timeVisitanteId: time.id }
                        ],
                        status: 'FINALIZADO'
                    }
                })

                let vitorias = 0
                let pontosPro = 0
                let pontosContra = 0

                jogos.forEach(jogo => {
                    const isTimeCasa = jogo.timeCasaId === time.id
                    const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
                    const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

                    pontosPro += pontosFeitos
                    pontosContra += pontosSofridos

                    if (pontosFeitos > pontosSofridos) {
                        vitorias++
                    }
                })

                const timeClassificado: TimeClassificado = {
                    timeId: time.id,
                    time: {
                        id: time.id,
                        nome: time.nome,
                        sigla: time.sigla,
                        logo: time.logo
                    },
                    vitorias,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra,
                    regional: regionalTipo,
                    regionalTipo: regionalTipo,
                    posicaoRegional: 0
                }

                classificacao.push(timeClassificado)
            }

            // Ordenar classificação
            classificacao.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacao.forEach((item, index) => {
                item.posicaoRegional = index + 1
            })

            return classificacao
        }

        const classificacaoCerrado = await calcularClassificacaoRegional('CERRADO')
        const classificacaoAmazonia = await calcularClassificacaoRegional('AMAZONIA')

        const primeiroCerrado = classificacaoCerrado[0]
        const segundoCerrado = classificacaoCerrado[1]

        const primeiroAmazonia = classificacaoAmazonia[0]
        const segundoAmazonia = classificacaoAmazonia[1]

        if (!primeiroCerrado || !primeiroAmazonia) {
            throw new Error('Primeiros colocados dos regionais não encontrados')
        }

        // Criar jogos de Semifinal (Centro-Norte vai direto para semifinal)
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 1',
                timeClassificado1Id: primeiroAmazonia.timeId,
                timeClassificado2Id: segundoCerrado?.timeId,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Centro-Norte 2',
                timeClassificado1Id: primeiroCerrado.timeId,
                timeClassificado2Id: segundoAmazonia?.timeId,
                dataJogo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        // Criar Final de Conferência
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Conferência Centro-Norte',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO'
            }
        })

        return {
            wildcards: [], // Centro-Norte não tem wild card
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroCerrado, primeiroAmazonia],
                wildcards: [segundoCerrado, segundoAmazonia].filter(Boolean)
            }
        }
    } catch (error) {
        console.error('Erro ao gerar playoffs Centro-Norte:', error)
        throw error
    }
}

// SUBSTITUIR a função gerarPlayoffsNordeste no arquivo src/utils/superligaUtils.ts

export async function gerarPlayoffsNordeste(campeonatoId: number, conferenciaId: number) {
    try {
        console.log('🌵 INICIANDO GERAÇÃO DE PLAYOFFS NORDESTE...')

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        const nordeste = classificacao['NORDESTE'];

        if (!nordeste || nordeste.length === 0) {
            throw new Error('Classificação da Conferência Nordeste não encontrada');
        }

        // A conferência Nordeste tem apenas 1 regional (ATLÂNTICO) com 6 times
        const atlantico = nordeste[0];
        if (!atlantico || !atlantico.times) {
            throw new Error('Regional Atlântico não encontrado ou sem times');
        }

        const times = atlantico.times;
        if (times.length < 6) {
            throw new Error(`Regional Atlântico deve ter 6 times, encontrados ${times.length}`);
        }

        console.log('📋 Times classificados no Regional Atlântico:')
        times.forEach((time: any, index: number) => {
            console.log(`   ${index + 1}º. ${time.time.nome}`)
        })

        // Separar times por posição
        const primeiro = times[0]  // 1º lugar -> Semifinal direta
        const segundo = times[1]   // 2º lugar -> Semifinal direta  
        const terceiro = times[2]  // 3º lugar -> Fica fora
        const quarto = times[3]    // 4º lugar -> Wild Card
        const quinto = times[4]    // 5º lugar -> Wild Card
        const sexto = times[5]     // 6º lugar -> Fica fora

        console.log('🎯 Estrutura dos playoffs Nordeste:')
        console.log(`   1º (${primeiro.time.nome}) -> Semifinal direta`)
        console.log(`   2º (${segundo.time.nome}) -> Semifinal direta`)
        console.log(`   3º (${terceiro.time.nome}) -> Eliminado`)
        console.log(`   4º (${quarto.time.nome}) -> Wild Card`)
        console.log(`   5º (${quinto.time.nome}) -> Wild Card`)
        console.log(`   6º (${sexto.time.nome}) -> Eliminado`)

        // 1. WILD CARD: 4º vs 5º lugar
        console.log('🃏 Criando Wild Card Nordeste: 4º vs 5º')
        const wildCard = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'WILD_CARD',
                rodada: 1,
                nome: 'Wild Card Nordeste',
                timeClassificado1Id: quarto.timeId,   // 4º lugar
                timeClassificado2Id: quinto.timeId,   // 5º lugar
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 dias
                status: 'AGUARDANDO'
            }
        });

        // 2. SEMIFINAL 1: 1º lugar vs Vencedor Wild Card
        console.log('🏅 Criando Semifinal Nordeste 1: 1º vs Vencedor WC')
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Nordeste 1',
                timeClassificado1Id: primeiro.timeId, // 1º lugar
                timeClassificado2Id: null, // Será preenchido após wild card
                jogoAnterior2Id: wildCard.id, // Vencedor do Wild Card
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 dias
                status: 'AGUARDANDO'
            }
        });

        // 3. SEMIFINAL 2: 2º lugar vs Bye (classificação direta para final)
        console.log('🏅 Criando Semifinal Nordeste 2: 2º lugar (bye)')
        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'SEMIFINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Semifinal Nordeste 2 (Bye)',
                timeClassificado1Id: segundo.timeId, // 2º lugar
                timeClassificado2Id: null, // Bye - vai direto para final
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'FINALIZADO' // Marcamos como finalizado pois é um bye
            }
        });

        // Marcar o 2º lugar como vencedor do bye
        await prisma.playoffJogo.update({
            where: { id: semifinal2.id },
            data: { timeVencedorId: segundo.timeId }
        });

        // 4. FINAL DE CONFERÊNCIA: Vencedor Semifinal 1 vs 2º lugar (bye winner)
        console.log('🏆 Criando Final Conferência Nordeste')
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                fase: 'FINAL_CONFERENCIA',
                rodada: 1,
                nome: 'Final Conferência Nordeste',
                timeClassificado1Id: null,
                timeClassificado2Id: segundo.timeId, // 2º lugar (bye winner)
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // +21 dias
                status: 'AGUARDANDO'
            }
        });

        console.log('✅ Playoffs Nordeste gerados com sucesso!')
        console.log(`   🃏 Wild Card: ${quarto.time.nome} vs ${quinto.time.nome}`)
        console.log(`   🏅 Semifinal 1: ${primeiro.time.nome} vs Vencedor WC`)
        console.log(`   🏅 Semifinal 2: ${segundo.time.nome} (bye - classificado direto)`)
        console.log(`   🏆 Final: Vencedor SF1 vs ${segundo.time.nome}`)

        return {
            wildcards: [wildCard],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiro, segundo],
                wildcards: [quarto, quinto]
            }
        }

    } catch (error) {
        console.error('❌ Erro ao gerar playoffs Nordeste:', error)
        throw error
    }
}


export async function obterStatusPlayoffs(campeonatoId: number) {
    try {
        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                playoffJogos: {
                    orderBy: [
                        { fase: 'asc' },
                        { rodada: 'asc' }
                    ]
                }
            }
        })

        // ✅ CORREÇÃO: Definir o tipo do objeto status
        const status: { [key: string]: any } = {}

        for (const conferencia of conferencias) {
            const jogosConferencia = conferencia.playoffJogos

            const wildcards = jogosConferencia.filter(j => j.fase === 'WILD_CARD')
            const semifinais = jogosConferencia.filter(j => j.fase === 'SEMIFINAL_CONFERENCIA')
            const final = jogosConferencia.find(j => j.fase === 'FINAL_CONFERENCIA')

            status[conferencia.tipo] = {
                wildcards: {
                    total: wildcards.length,
                    finalizados: wildcards.filter(j => j.status === 'FINALIZADO').length,
                    completo: wildcards.every(j => j.status === 'FINALIZADO')
                },
                semifinais: {
                    total: semifinais.length,
                    finalizados: semifinais.filter(j => j.status === 'FINALIZADO').length,
                    completo: semifinais.every(j => j.status === 'FINALIZADO')
                },
                final: {
                    existe: !!final,
                    finalizado: final?.status === 'FINALIZADO',
                    campeao: final?.timeVencedorId
                }
            }
        }

        // Status da fase nacional
        const faseNacional = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                fase: { in: ['SEMIFINAL_NACIONAL', 'FINAL_NACIONAL'] }
            }
        })

        const semifinaisNacionais = faseNacional.filter(j => j.fase === 'SEMIFINAL_NACIONAL')
        const finalNacional = faseNacional.find(j => j.fase === 'FINAL_NACIONAL')

        status['NACIONAL'] = {
            semifinais: {
                total: semifinaisNacionais.length,
                finalizados: semifinaisNacionais.filter(j => j.status === 'FINALIZADO').length,
                completo: semifinaisNacionais.every(j => j.status === 'FINALIZADO')
            },
            final: {
                existe: !!finalNacional,
                finalizado: finalNacional?.status === 'FINALIZADO',
                campeao: finalNacional?.timeVencedorId
            }
        }

        return status
    } catch (error) {
        console.error('Erro ao obter status dos playoffs:', error)
        throw error
    }
}