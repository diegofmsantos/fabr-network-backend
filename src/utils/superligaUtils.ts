import { PrismaClient } from '@prisma/client'
import { TIMES_SUPERLIGA } from '../types'
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

        // ✅ 1. BUSCAR SUPERLIGA COM RELACIONAMENTOS
        const superliga = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                }
            }
        })

        if (!superliga) {
            throw new Error('Superliga não encontrada')
        }

        // ✅ 2. BUSCAR TODOS OS TIMES DA TEMPORADA
        const todosTimes = await prisma.time.findMany({
            where: { temporada }
        })

        console.log(`Encontrados ${todosTimes.length} times para distribuir`)

        if (todosTimes.length !== 32) {
            throw new Error(`Esperados 32 times, encontrados ${todosTimes.length}`)
        }

        // ✅ 3. LIMPAR DISTRIBUIÇÃO EXISTENTE (SE HOUVER)
        await prisma.distribuicaoTime.deleteMany({
            where: { campeonatoId }
        })

        // ✅ 4. CONFIGURAÇÃO DA DISTRIBUIÇÃO
        const DISTRIBUICAO_CONFIG = {
            'SUDESTE': {
                regionais: {
                    'SERRAMAR': ['Vasco Almirantes', 'Flamengo Imperadores', 'Locomotiva FA', 'Tritões FA'],
                    'CANASTRA': ['Galo FA', 'Moura Lacerda Dragons', 'Rio Preto Weilers', 'Spartans FA'],
                    'CANTAREIRA': ['Corinthians Steamrollers', 'Cruzeiro FA', 'Guarulhos Rhynos', 'Ocelots FA']
                }
            },
            'SUL': {
                regionais: {
                    'ARAUCARIA': ['Timbó Rex', 'Coritiba Crocodiles', 'Calvary Cavaliers', 'Brown Spiders'],
                    'PAMPA': ['Santa Maria Soldiers', 'Juventude FA', 'Bravos FA', 'Istepôs FA']
                }
            },
            'NORDESTE': {
                regionais: {
                    'ATLANTICO': ['Fortaleza Tritões', 'Ceará Sabres', 'João Pessoa Espectros', 'Recife Mariners', 'Cavalaria 2 de Julho', 'Caruaru Wolves']
                }
            },
            'CENTRO NORTE': {
                regionais: {
                    'CERRADO': ['Rondonópolis Hawks', 'Cuiabá Arsenal', 'Tubarões do Cerrado'],
                    'AMAZONIA': ['Porto Velho Miners', 'Manaus FA', 'Manaus Cavaliers']
                }
            }
        }

        let timesDistribuidos = 0
        const erros: string[] = []

        // ✅ 5. DISTRIBUIR TIMES POR CONFERÊNCIA/REGIONAL
        for (const [confTipo, confConfig] of Object.entries(DISTRIBUICAO_CONFIG)) {
            console.log(`🏆 Processando Conferência ${confTipo}...`)

            // Buscar conferência no banco
            const conferencia = superliga.conferencias.find(c => c.tipo === confTipo)
            if (!conferencia) {
                erros.push(`Conferência ${confTipo} não encontrada`)
                continue
            }

            // Processar regionais
            for (const [regTipo, timesEsperados] of Object.entries(confConfig.regionais)) {
                console.log(`  📍 Processando Regional ${regTipo}...`)

                // Buscar regional no banco
                const regional = conferencia.regionais.find(r => r.tipo === regTipo)
                if (!regional) {
                    erros.push(`Regional ${regTipo} não encontrado na conferência ${confTipo}`)
                    continue
                }

                // Distribuir times do regional
                for (const nomeTime of timesEsperados) {
                    const time = todosTimes.find(t => t.nome === nomeTime)
                    if (!time) {
                        erros.push(`Time "${nomeTime}" não encontrado no banco`)
                        continue
                    }

                    // ✅ SALVAR DISTRIBUIÇÃO NO BANCO!
                    await prisma.distribuicaoTime.create({
                        data: {
                            campeonatoId: superliga.id,
                            conferenciaId: conferencia.id,
                            regionalId: regional.id,
                            timeId: time.id,
                            temporada: temporada,
                            conferenciaType: confTipo,
                            regionalType: regTipo
                        }
                    })

                    console.log(`    ✅ ${time.nome} -> ${regTipo}`)
                    timesDistribuidos++
                }

                console.log(`Regional ${regTipo}: ${timesEsperados.length} times validados`)
            }
        }

        // ✅ 6. VERIFICAR SE TODOS OS TIMES FORAM DISTRIBUÍDOS
        if (erros.length > 0) {
            console.error('❌ Erros encontrados:', erros)
            throw new Error(`Erros na distribuição: ${erros.join(', ')}`)
        }

        if (timesDistribuidos !== 32) {
            throw new Error(`Distribuição incompleta: ${timesDistribuidos}/32 times`)
        }

        console.log(`Distribuição automática concluída: ${timesDistribuidos} times distribuídos`)

        // ✅ 7. RETORNAR RESULTADO
        return {
            timesDistribuidos,
            conferencias: Object.keys(DISTRIBUICAO_CONFIG).length,
            regionais: Object.values(DISTRIBUICAO_CONFIG).reduce((acc, conf) => acc + Object.keys(conf.regionais).length, 0),
            sucesso: true
        }

    } catch (error) {
        console.error('❌ Erro na distribuição automática:', error)
        throw error
    }
}

export async function gerarPlayoffsSudeste(campeonatoId: number, conferenciaId: number) {
    try {
        console.log('🏭 INICIANDO GERAÇÃO DE PLAYOFFS SUDESTE...')

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        const sudeste = classificacao['SUDESTE'];
        if (!sudeste || !Array.isArray(sudeste)) {
            throw new Error('Classificação da Conferência Sudeste não encontrada');
        }
        const [serramar, canastra, cantareira] = sudeste;

        // Obter 1º colocados de cada regional
        const primeiros = [
            { time: serramar.times[0], regional: 'SERRAMAR' },
            { time: canastra.times[0], regional: 'CANASTRA' },
            { time: cantareira.times[0], regional: 'CANTAREIRA' }
        ].sort((a, b) => {
            // Ordenar por vitórias, depois saldo, depois pontos pró
            if (b.time.vitorias !== a.time.vitorias) return b.time.vitorias - a.time.vitorias;
            if (b.time.saldo !== a.time.saldo) return b.time.saldo - a.time.saldo;
            return b.time.pontosPro - a.time.pontosPro;
        });

        // Obter 2º colocados de cada regional
        const segundos = [
            { time: serramar.times[1], regional: 'SERRAMAR' },
            { time: canastra.times[1], regional: 'CANASTRA' },
            { time: cantareira.times[1], regional: 'CANTAREIRA' }
        ].sort((a, b) => {
            if (b.time.vitorias !== a.time.vitorias) return b.time.vitorias - a.time.vitorias;
            if (b.time.saldo !== a.time.saldo) return b.time.saldo - a.time.saldo;
            return b.time.pontosPro - a.time.pontosPro;
        });

        console.log('📋 Classificação Sudeste:')
        console.log('1º colocados:', primeiros.map(p => `${p.time.time.nome} (${p.regional})`))
        console.log('2º colocados:', segundos.map(s => `${s.time.time.nome} (${s.regional})`))

        // CLASSIFICAÇÃO DIRETA PARA SEMIFINAL (conforme Figma):
        const primeiroMelhor1 = primeiros[0]  // 1º melhor 1º colocado
        const segundoMelhor1 = primeiros[1]   // 2º melhor 1º colocado

        // WILD CARDS (conforme Figma):
        const terceiroMelhor1 = primeiros[2]  // 3º melhor 1º colocado
        const primeiroMelhor2 = segundos[0]   // 1º melhor 2º colocado
        const segundoMelhor2 = segundos[1]    // 2º melhor 2º colocado
        const terceiroMelhor2 = segundos[2]   // 3º melhor 2º colocado

        // CRIAR WILD CARDS
        const wildcard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: terceiroMelhor1.time.time.id,
                timeClassificado2Id: terceiroMelhor2.time.time.id,
                fase: 'WILD CARD',
                rodada: 1,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '3º melhor 1º × 3º melhor 2º'
            }
        });

        const wildcard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroMelhor2.time.time.id,
                timeClassificado2Id: segundoMelhor2.time.time.id,
                fase: 'WILD CARD',
                rodada: 2,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º melhor 2º × 2º melhor 2º'
            }
        });

        // CRIAR SEMIFINAIS
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroMelhor1.time.time.id,
                timeClassificado2Id: null, // Será o vencedor do wild card mais próximo
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º melhor 1º × Vencedor WC'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: segundoMelhor1.time.time.id,
                timeClassificado2Id: null, // Será o vencedor do wild card mais próximo
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º melhor 1º × Vencedor WC'
            }
        });

        // CRIAR FINAL
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, // Vencedor Semifinal 1
                timeClassificado2Id: null, // Vencedor Semifinal 2
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Sudeste'
            }
        });

        console.log('✅ Playoffs Sudeste gerados conforme Figma!')
        return {
            wildcards: [wildcard1, wildcard2],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroMelhor1, segundoMelhor1],
                wildcards: [terceiroMelhor1, primeiroMelhor2, segundoMelhor2, terceiroMelhor2]
            }
        }

    } catch (error) {
        console.error('Erro ao gerar playoffs Sudeste:', error)
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
        console.log('🧊 INICIANDO GERAÇÃO DE PLAYOFFS SUL...')

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        const sul = classificacao['SUL'];

        if (!sul || !Array.isArray(sul)) {
            throw new Error('Classificação da Conferência Sul não encontrada');
        }

        // Sul tem 2 regionais: ARAUCÁRIA e PAMPA
        const [araucaria, pampa] = sul

        const primeiroAraucaria = araucaria.times[0];  // 1º Araucária
        const segundoAraucaria = araucaria.times[1];   // 2º Araucária
        const terceiroAraucaria = araucaria.times[2];  // 3º Araucária

        const primeiroPampa = pampa.times[0];    // 1º Pampa
        const segundoPampa = pampa.times[1];     // 2º Pampa
        const terceiroPampa = pampa.times[2];    // 3º Pampa

        console.log('📋 Classificação Sul:')
        console.log(`1º Araucária: ${primeiroAraucaria.time.nome}`)
        console.log(`1º Pampa: ${primeiroPampa.time.nome}`)

        // WILD CARDS (conforme Figma):
        const wildcard1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: segundoAraucaria.time.id,
                timeClassificado2Id: terceiroPampa.time.id,
                fase: 'WILD CARD',
                rodada: 1,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º Araucária × 3º Pampa'
            }
        });

        const wildcard2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: segundoPampa.time.id,
                timeClassificado2Id: terceiroAraucaria.time.id,
                fase: 'WILD CARD',
                rodada: 2,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º Pampa × 3º Araucária'
            }
        });

        // SEMIFINAIS (conforme Figma):
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroAraucaria.time.id,
                timeClassificado2Id: null, // Vencedor WC mais próximo
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Araucária × Wildcard'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroPampa.time.id,
                timeClassificado2Id: null, // Vencedor WC mais próximo
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Pampa × Wildcard'
            }
        });

        // FINAL
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, // Vencedor Semifinal 1
                timeClassificado2Id: null, // Vencedor Semifinal 2
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Sul'
            }
        });

        console.log('✅ Playoffs Sul gerados conforme Figma!')
        return {
            wildcards: [wildcard1, wildcard2],
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
        console.log('🌲 INICIANDO GERAÇÃO DE PLAYOFFS CENTRO-NORTE...')

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        const centroNorte = classificacao['CENTRO NORTE'];

        if (!centroNorte || !Array.isArray(centroNorte)) {
            throw new Error('Classificação da Conferência Centro-Norte não encontrada');
        }

        // Centro-Norte tem 2 regionais: CERRADO (3 times) e AMAZÔNIA (3 times)
        const [cerrado, amazonia] = centroNorte

        const primeiroCerrado = cerrado.times[0];   // 1º Cerrado
        const segundoCerrado = cerrado.times[1];    // 2º Cerrado

        const primeiroAmazonia = amazonia.times[0]; // 1º Amazônia
        const segundoAmazonia = amazonia.times[1];  // 2º Amazônia

        console.log('📋 Classificação Centro-Norte:')
        console.log(`1º Cerrado: ${primeiroCerrado.time.nome}`)
        console.log(`1º Amazônia: ${primeiroAmazonia.time.nome}`)

        // CENTRO-NORTE NÃO TEM WILD CARD (conforme Figma)

        // SEMIFINAIS (conforme Figma):
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroCerrado.time.id,
                timeClassificado2Id: segundoCerrado.time.id,
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Cerrado × 2º Cerrado'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroAmazonia.time.id,
                timeClassificado2Id: segundoAmazonia.time.id,
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Amazônia × 2º Amazônia'
            }
        });

        // FINAL
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, // Vencedor Semifinal 1
                timeClassificado2Id: null, // Vencedor Semifinal 2
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Centro-Norte'
            }
        });

        console.log('✅ Playoffs Centro-Norte gerados conforme Figma!')
        return {
            wildcards: [], // Centro-Norte não tem wild card
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiroCerrado, primeiroAmazonia],
                wildcards: [segundoCerrado, segundoAmazonia]
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
        if (!nordeste || !Array.isArray(nordeste)) {
            throw new Error('Classificação da Conferência Nordeste não encontrada');
        }

        // Nordeste tem 1 regional: ATLÂNTICO com 6 times
        const atlantico = nordeste[0];
        const times = atlantico.times;

        if (times.length < 6) {
            throw new Error(`Regional Atlântico deve ter 6 times, encontrados ${times.length}`);
        }

        const primeiro = times[0];   // 1º lugar -> Semifinal direta
        const segundo = times[1];    // 2º lugar -> Semifinal direta
        const terceiro = times[2];   // 3º lugar -> Semifinal (pode jogar com 1º ou 2º)
        const quarto = times[3];     // 4º lugar -> Wild Card
        const quinto = times[4];     // 5º lugar -> Wild Card
        // 6º lugar está eliminado

        console.log('📋 Classificação Nordeste:')
        times.forEach((time: any, index: number) => {
            console.log(`   ${index + 1}º. ${time.time.nome}`)
        });

        // WILD CARD (conforme Figma):
        const wildcard = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: quarto.time.id,
                timeClassificado2Id: quinto.time.id,
                fase: 'WILD CARD',
                rodada: 1,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '4º Atlântico × 5º Atlântico'
            }
        });

        // SEMIFINAIS (conforme Figma):
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiro.time.id,
                timeClassificado2Id: terceiro.time.id, // 3º pode ir direto ou vencedor WC
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Atlântico × 3º ou Wildcard'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: segundo.time.id,
                timeClassificado2Id: null, // Será definido baseado no wild card
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º Atlântico × 3º ou Wildcard'
            }
        });

        // FINAL
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, // Vencedor Semifinal 1
                timeClassificado2Id: null, // Vencedor Semifinal 2
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Nordeste'
            }
        });

        console.log('✅ Playoffs Nordeste gerados conforme Figma!')
        return {
            wildcards: [wildcard],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiro, segundo],
                wildcards: [terceiro, quarto, quinto]
            }
        }

    } catch (error) {
        console.error('Erro ao gerar playoffs Nordeste:', error)
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

            const wildcards = jogosConferencia.filter(j => j.fase === 'WILD CARD')
            const semifinais = jogosConferencia.filter(j => j.fase === 'SEMIFINAL CONFERENCIA')
            const final = jogosConferencia.find(j => j.fase === 'FINAL CONFERENCIA')

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
                fase: { in: ['SEMIFINAL NACIONAL', 'FINAL NACIONAL'] }
            }
        })

        const semifinaisNacionais = faseNacional.filter(j => j.fase === 'SEMIFINAL NACIONAL')
        const finalNacional = faseNacional.find(j => j.fase === 'FINAL NACIONAL')

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