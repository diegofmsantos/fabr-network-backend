import { PrismaClient } from '@prisma/client'
import { calcularClassificacaoPorConferencia } from './distribuicaoUtils'

const prisma = new PrismaClient()

export async function distribuirTimesAutomaticamente(campeonatoId: number, temporada: string) {
    try {
        console.log(`Iniciando distribuição automática de times para a temporada ${temporada}`)

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

        const todosTimes = await prisma.time.findMany({
            where: { temporada }
        })

        console.log(`Encontrados ${todosTimes.length} times para distribuir`)

        if (todosTimes.length !== 32) {
            throw new Error(`Esperados 32 times, encontrados ${todosTimes.length}`)
        }

        await prisma.distribuicaoTime.deleteMany({
            where: { campeonatoId }
        })

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

        for (const [confTipo, confConfig] of Object.entries(DISTRIBUICAO_CONFIG)) {
            console.log(`🏆 Processando Conferência ${confTipo}...`)

            const conferencia = superliga.conferencias.find(c => c.tipo === confTipo)
            if (!conferencia) {
                erros.push(`Conferência ${confTipo} não encontrada`)
                continue
            }

            for (const [regTipo, timesEsperados] of Object.entries(confConfig.regionais)) {
                console.log(`  📍 Processando Regional ${regTipo}...`)

                const regional = conferencia.regionais.find(r => r.tipo === regTipo)
                if (!regional) {
                    erros.push(`Regional ${regTipo} não encontrado na conferência ${confTipo}`)
                    continue
                }

                for (const nomeTime of timesEsperados) {
                    const time = todosTimes.find(t => t.nome === nomeTime)
                    if (!time) {
                        erros.push(`Time "${nomeTime}" não encontrado no banco`)
                        continue
                    }

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

        if (erros.length > 0) {
            console.error('❌ Erros encontrados:', erros)
            throw new Error(`Erros na distribuição: ${erros.join(', ')}`)
        }

        if (timesDistribuidos !== 32) {
            throw new Error(`Distribuição incompleta: ${timesDistribuidos}/32 times`)
        }

        console.log(`Distribuição automática concluída: ${timesDistribuidos} times distribuídos`)

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

        const primeiros = [
            { time: serramar.times[0], regional: 'SERRAMAR' },
            { time: canastra.times[0], regional: 'CANASTRA' },
            { time: cantareira.times[0], regional: 'CANTAREIRA' }
        ].sort((a, b) => {
            if (b.time.vitorias !== a.time.vitorias) return b.time.vitorias - a.time.vitorias;
            if (b.time.saldo !== a.time.saldo) return b.time.saldo - a.time.saldo;
            return b.time.pontosPro - a.time.pontosPro;
        });

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

        const primeiroMelhor1 = primeiros[0]  
        const segundoMelhor1 = primeiros[1]   

        const terceiroMelhor1 = primeiros[2]  
        const primeiroMelhor2 = segundos[0]   
        const segundoMelhor2 = segundos[1]    
        const terceiroMelhor2 = segundos[2]  

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

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroMelhor1.time.time.id,
                timeClassificado2Id: null, 
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
                timeClassificado2Id: null, 
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º melhor 1º × Vencedor WC'
            }
        });

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, 
                timeClassificado2Id: null, 
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
            if (jogo.timeClassificado1Id && jogo.timeClassificado2Id) {
                const placar1 = Math.floor(Math.random() * 35) + 7 
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


export async function gerarPlayoffsSul(campeonatoId: number, conferenciaId: number) {
    try {
        console.log('🧊 INICIANDO GERAÇÃO DE PLAYOFFS SUL...')

        const playoffsExistentes = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                conferenciaId
            }
        })

        if (playoffsExistentes.length > 0) {
            console.log(`⚠️  Playoffs Sul já existem (${playoffsExistentes.length} jogos)`)
            return {
                wildcards: playoffsExistentes.filter(j => j.fase === 'WILD CARD'),
                semifinais: playoffsExistentes.filter(j => j.fase === 'SEMIFINAL CONFERENCIA'),
                final: playoffsExistentes.find(j => j.fase === 'FINAL CONFERENCIA'),
                timesClassificados: { diretos: [], wildcards: [] }
            }
        }

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        const sul = classificacao['SUL'];

        if (!sul || !Array.isArray(sul)) {
            throw new Error('Classificação da Conferência Sul não encontrada');
        }

        const [araucaria, pampa] = sul;

        if (!araucaria || !pampa) {
            throw new Error('Regionais Araucária ou Pampa não encontradas');
        }

        const primeiroAraucaria = araucaria.times[0];
        const segundoAraucaria = araucaria.times[1];
        const terceiroAraucaria = araucaria.times[2];

        const primeiroPampa = pampa.times[0];
        const segundoPampa = pampa.times[1];
        const terceiroPampa = pampa.times[2];

        console.log('📋 Classificação Sul:')
        console.log(`   🏆 Araucária: 1º ${primeiroAraucaria?.time.nome}, 2º ${segundoAraucaria?.time.nome}, 3º ${terceiroAraucaria?.time.nome}`)
        console.log(`   🏆 Pampa: 1º ${primeiroPampa?.time.nome}, 2º ${segundoPampa?.time.nome}, 3º ${terceiroPampa?.time.nome}`)

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

        console.log(`✅ Wild Card 1: ${segundoAraucaria.time.nome} × ${terceiroPampa.time.nome}`)
        console.log(`✅ Wild Card 2: ${segundoPampa.time.nome} × ${terceiroAraucaria.time.nome}`)

        if (wildcard1.timeClassificado1Id === wildcard2.timeClassificado1Id &&
            wildcard1.timeClassificado2Id === wildcard2.timeClassificado2Id) {
            console.error('❌ ERRO: Wild Cards são idênticos!')
            throw new Error('Wild Cards duplicados detectados')
        }

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroAraucaria.time.id,
                timeClassificado2Id: null, 
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Araucária × Vencedor Wild Card'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiroPampa.time.id,
                timeClassificado2Id: null, 
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Pampa × Vencedor Wild Card'
            }
        });

        console.log(`✅ Semifinal 1: ${primeiroAraucaria.time.nome} × Vencedor Wild Card`)
        console.log(`✅ Semifinal 2: ${primeiroPampa.time.nome} × Vencedor Wild Card`)

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, 
                timeClassificado2Id: null, 
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Sul'
            }
        });

        console.log('✅ Final da Conferência Sul criada')
        console.log('✅ Playoffs Sul gerados com sucesso!')

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
        console.error('❌ Erro ao gerar playoffs Sul:', error)
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

        const [cerrado, amazonia] = centroNorte

        const primeiroCerrado = cerrado.times[0];   
        const segundoCerrado = cerrado.times[1];   

        const primeiroAmazonia = amazonia.times[0]; 
        const segundoAmazonia = amazonia.times[1];  

        console.log('📋 Classificação Centro-Norte:')
        console.log(`1º Cerrado: ${primeiroCerrado.time.nome}`)
        console.log(`1º Amazônia: ${primeiroAmazonia.time.nome}`)

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

        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, 
                timeClassificado2Id: null, 
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Centro-Norte'
            }
        });

        console.log('✅ Playoffs Centro-Norte gerados conforme Figma!')
        return {
            wildcards: [],
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



export async function gerarPlayoffsNordeste(campeonatoId: number, conferenciaId: number) {
    try {
        console.log('🌵 INICIANDO GERAÇÃO DE PLAYOFFS NORDESTE...')
        console.log(`   📋 CampeonatoId: ${campeonatoId}`)
        console.log(`   📋 ConferenciaId: ${conferenciaId}`)
        const playoffsExistentes = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                conferenciaId
            }
        })

        console.log(`   📊 Playoffs existentes: ${playoffsExistentes.length}`)

        if (playoffsExistentes.length > 0) {
            console.log(`⚠️  Playoffs Nordeste já existem (${playoffsExistentes.length} jogos)`)
            return {
                wildcards: playoffsExistentes.filter(j => j.fase === 'WILD CARD'),
                semifinais: playoffsExistentes.filter(j => j.fase === 'SEMIFINAL CONFERENCIA'),
                final: playoffsExistentes.find(j => j.fase === 'FINAL CONFERENCIA'),
                timesClassificados: { diretos: [], wildcards: [] }
            }
        }

        console.log('   📈 Calculando classificação...')
        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);
        console.log(`   📊 Classificação calculada:`, Object.keys(classificacao))

        let nordeste = classificacao['NORDESTE'] || classificacao['Nordeste'] || classificacao['nordeste'];

        console.log(`   🔍 Nordeste encontrado:`, nordeste ? 'SIM' : 'NÃO')

        if (!nordeste) {
            console.log('   ❌ Tentando buscar na estrutura completa...')
            console.log('   📊 Chaves disponíveis:', Object.keys(classificacao))

            const chaveNordeste = Object.keys(classificacao).find(key =>
                key.toLowerCase().includes('nordeste')
            );

            if (chaveNordeste) {
                nordeste = classificacao[chaveNordeste];
                console.log(`   ✅ Nordeste encontrado com chave: "${chaveNordeste}"`)
            }
        }

        if (!nordeste || !Array.isArray(nordeste) || nordeste.length === 0) {
            console.error('   ❌ ERRO: Classificação do Nordeste não encontrada')
            console.error('   📊 Classificação disponível:', Object.keys(classificacao))
            throw new Error('Classificação da Conferência Nordeste não encontrada ou vazia')
        }

        const atlantico = nordeste[0];
        if (!atlantico || !atlantico.times) {
            throw new Error('Regional Atlântico não encontrado na classificação do Nordeste')
        }

        const times = atlantico.times;

        if (times.length < 6) {
            console.error(`   ❌ Regional Atlântico tem apenas ${times.length} times, esperado 6`)
            throw new Error(`Regional Atlântico deve ter 6 times, encontrados ${times.length}`)
        }

        console.log('📋 Classificação Final Regional Atlântico:')
        times.slice(0, 6).forEach((time: any, index: number) => {
            console.log(`   ${index + 1}º. ${time.time?.nome || 'Nome não disponível'} (${time.vitorias}V-${time.derrotas}D)`)
        });

        const primeiro = times[0];   
        const segundo = times[1];     
        const terceiro = times[2];   
        const quarto = times[3];     
        const quinto = times[4];     

        [primeiro, segundo, terceiro, quarto, quinto].forEach((time, index) => {
            if (!time?.time?.id) {
                throw new Error(`Time na posição ${index + 1} não tem ID válido`)
            }
        });

        console.log('   🃏 Criando Wild Card...')
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

        console.log(`✅ Wild Card criado: ${quarto.time.nome} × ${quinto.time.nome}`)

        console.log('   🏅 Criando Semifinais...')
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: primeiro.time.id,
                timeClassificado2Id: terceiro.time.id, 
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Atlântico × 3º Atlântico'
            }
        });

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: segundo.time.id,
                timeClassificado2Id: null, 
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º Atlântico × Vencedor Wild Card'
            }
        });

        console.log(`✅ Semifinal 1: ${primeiro.time.nome} × ${terceiro.time.nome}`)
        console.log(`✅ Semifinal 2: ${segundo.time.nome} × Vencedor Wild Card`)

        console.log('   🏆 Criando Final...')
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                conferenciaId,
                timeClassificado1Id: null, 
                timeClassificado2Id: null, 
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Nordeste'
            }
        });

        console.log('✅ Final da Conferência Nordeste criada')

        const resultado = {
            wildcards: [wildcard],
            semifinais: [semifinal1, semifinal2],
            final,
            timesClassificados: {
                diretos: [primeiro, segundo, terceiro],
                wildcards: [quarto, quinto]
            }
        }

        console.log('🔥 PATCH: Chegou ao final da função com sucesso')
        console.log('🔥 PATCH: resultado =', {
            wildcards: resultado.wildcards.length,
            semifinais: resultado.semifinais.length,
            final: !!resultado.final
        })

        console.log('✅ Playoffs Nordeste gerados com sucesso!')
        return resultado

    } catch (error) {

        console.error('❌ ERRO DETALHADO na geração de playoffs Nordeste:')
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

export async function gerarTodosPlayoffs(campeonatoId: number) {
    console.log('🔥 gerarTodosPlayoffs INICIOU com campeonatoId:', campeonatoId)
    try {
        console.log('🏆 DEBUG: INICIANDO GERAÇÃO DE TODOS OS PLAYOFFS...')

        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: { regionais: true },
            orderBy: { ordem: 'asc' }
        })

        console.log(`📋 DEBUG: Encontradas ${conferencias.length} conferências`)

        let totalPlayoffJogos = 0

        for (const conf of conferencias) {
            console.log(`🔥 Processando conferência: ${conf.tipo} (ID: ${conf.id})`)
            console.log(`\n🎯 DEBUG: Processando ${conf.tipo}...`)
            console.log(`   📋 ID da conferência: ${conf.id}`)

            try {
                const playoffsExistentes = await prisma.playoffJogo.findMany({
                    where: {
                        campeonatoId,
                        conferenciaId: conf.id
                    }
                })

                if (playoffsExistentes.length > 0) {
                    console.log(`   ⚠️  ${conf.tipo} já tem ${playoffsExistentes.length} playoffs`)
                    const jogos = playoffsExistentes.length
                    totalPlayoffJogos += jogos
                    console.log(`   ✅ ${conf.tipo}: ${jogos} jogos (já existem)`)
                    continue
                }

                let resultado

                switch (conf.tipo) {
                    case 'SUDESTE':
                        console.log('🔥 PATCH: SUDESTE case executado')
                        console.log('   🏭 Gerando Sudeste...')
                        resultado = await gerarPlayoffsSudeste(campeonatoId, conf.id)
                        break

                    case 'SUL':
                        console.log('🔥 PATCH: SUL case executado')
                        console.log('   🧊 Gerando Sul...')
                        resultado = await gerarPlayoffsSul(campeonatoId, conf.id)
                        break

                    case 'NORDESTE':
                        console.log('   🌵 Gerando Nordeste...')
                        try {
                            resultado = await gerarPlayoffsNordeste(campeonatoId, conf.id)
                            console.log('🔥 PATCH: gerarPlayoffsNordeste retornou:', !!resultado)
                        } catch (errorNordeste) {
                            console.error('🔥 PATCH: ERRO no gerarPlayoffsNordeste:', errorNordeste)
                            throw errorNordeste
                        }
                        break

                    case 'CENTRO NORTE':
                        console.log('   🌲 Gerando Centro-Norte...')
                        resultado = await gerarPlayoffsCentroNorte(campeonatoId, conf.id)
                        break

                    default:
                        console.log('🔥 PATCH: DEFAULT case - tipo desconhecido:', conf.tipo)
                        continue
                }

                if (resultado) {
                    const jogos = resultado.wildcards.length + resultado.semifinais.length + (resultado.final ? 1 : 0)
                    totalPlayoffJogos += jogos
                    console.log(`   ✅ ${conf.tipo}: ${jogos} jogos gerados`)
                } else {
                    console.log(`   ❌ ${conf.tipo}: FALHOU - resultado nulo`)
                }

            } catch (error) {
                console.error(`   ❌ ERRO em ${conf.tipo}:`, error)
            }
        }

        console.log(`\n🎉 DEBUG: Total de playoffs gerados: ${totalPlayoffJogos}`)

        const playoffsFinais = await prisma.playoffJogo.findMany({
            where: { campeonatoId },
            include: { conferencia: true }
        })

        const playoffsPorConferencia: Record<string, number> = {}
        playoffsFinais.forEach(p => {
            const conf = p.conferencia?.tipo || 'SEM_CONFERENCIA'
            playoffsPorConferencia[conf] = (playoffsPorConferencia[conf] || 0) + 1
        })

        console.log(`📊 DEBUG: Status final por conferência:`)
        Object.entries(playoffsPorConferencia).forEach(([conf, count]) => {
            console.log(`   ${conf}: ${count} jogos`)
        })

        return totalPlayoffJogos

    } catch (error) {
        console.error('❌ DEBUG: Erro geral:', error)
        throw error
    }
}
