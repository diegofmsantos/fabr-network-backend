import { PrismaClient } from '@prisma/client'
import { calcularClassificacaoPorConferencia } from './distribuicaoUtils'
import { gerarTodosPlayoffs } from './superligaUtils'

const prisma = new PrismaClient()

export async function verificarGeracaoAutomaticaPlayoffs(campeonatoId: number) {
    try {
        const totalJogosTemporada = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR',
                status: 'FINALIZADO'
            }
        })

        console.log(`📊 Status: ${jogosFinalizados}/${totalJogosTemporada} jogos da temporada regular finalizados`)

        if (totalJogosTemporada > 0 && jogosFinalizados === totalJogosTemporada) {
            console.log('🏆 TODOS OS JOGOS DA TEMPORADA REGULAR FINALIZADOS!')

            const jogosPlayoffTBD = await prisma.jogo.count({
                where: {
                    campeonatoId,
                    fase: { not: 'TEMPORADA REGULAR' },
                    timeCasa: {
                        nome: { in: ['TBD', 'A definir', 'A DEFINIR'] }
                    }
                }
            })

            if (jogosPlayoffTBD > 0) {
                console.log(`🔄 Encontrados ${jogosPlayoffTBD} jogos de playoff TBD - Definindo times classificados...`)
                
                const resultado = await atualizarJogosPlayoffComTimes(campeonatoId)
                
                await prisma.campeonato.update({
                    where: { id: campeonatoId },
                    data: {
                        status: 'PLAYOFFS',
                        configSuperliga: {
                            faseAtual: 'PLAYOFFS CONFERENCIA',
                            playoffsDefinidosEm: new Date().toISOString(),
                            tipoGeracao: 'AGENDA_TBD'
                        } as any
                    }
                })

                console.log('🎉 PLAYOFFS DEFINIDOS AUTOMATICAMENTE!')
                return { 
                    playoffsGerados: true, 
                    jogosAtualizados: resultado.jogosAtualizados,
                    metodo: 'AGENDA_TBD'
                }
            }

            const playoffsExistentes = await prisma.playoffJogo.count({
                where: { campeonatoId }
            })

            if (playoffsExistentes === 0) {
                console.log('🔥 Gerando playoffs via tabela PlayoffJogo...')
                
                try {
                    const resultado = await gerarTodosPlayoffs(campeonatoId)
                    
                    await prisma.campeonato.update({
                        where: { id: campeonatoId },
                        data: {
                            status: 'PLAYOFFS',
                            configSuperliga: {
                                faseAtual: 'PLAYOFFS CONFERENCIA',
                                playoffsGeradosEm: new Date().toISOString(),
                                tipoGeracao: 'PLAYOFF_JOGO'
                            } as any
                        }
                    })

                    console.log('🎉 PLAYOFFS GERADOS VIA PLAYOFFJOGO!')
                    return { 
                        playoffsGerados: true, 
                        totalJogos: resultado,
                        metodo: 'PLAYOFF_JOGO'
                    }
                } catch (errorPlayoffs) {
                    console.error('❌ Erro ao gerar playoffs via PlayoffJogo:', errorPlayoffs)
                    throw errorPlayoffs
                }
            }
        }

        return { playoffsGerados: false }

    } catch (error) {
        console.error('❌ Erro na verificação automática:', error)
        return { playoffsGerados: false, erro: error }
    }
}

async function atualizarJogosPlayoffComTimes(campeonatoId: number) {
    try {
        console.log('🔄 INICIANDO ATUALIZAÇÃO DOS JOGOS TBD...')

        const classificacao = await calcularClassificacaoPorConferencia(campeonatoId)
        console.log('✅ Classificação calculada')

        let jogosAtualizados = 0
        const erros: string[] = []

        await atualizarWildCards(campeonatoId, classificacao)
        jogosAtualizados += await contarJogosAtualizados(campeonatoId, 'WILD CARD')

        console.log(`🎯 Wild Cards atualizados: ${await contarJogosAtualizados(campeonatoId, 'WILD CARD')} jogos`)

        return {
            jogosAtualizados,
            erros: erros.length > 0 ? erros : null,
            classificacao: Object.keys(classificacao)
        }

    } catch (error) {
        console.error('❌ Erro ao atualizar jogos playoff:', error)
        throw error
    }
}

async function atualizarWildCards(campeonatoId: number, classificacao: any) {
    try {

        if (classificacao['SUL']) {
            const sul = classificacao['SUL']
            const [araucaria, pampa] = sul

            const jogosWCSul = await prisma.jogo.findMany({
                where: {
                    campeonatoId,
                    fase: 'WILD CARD',
                    conferencia: 'Sul',
                    timeCasa: {
                        nome: { in: ['TBD', 'A definir', 'A DEFINIR'] }
                    }
                },
                orderBy: { id: 'asc' }
            })

            if (jogosWCSul.length >= 2 && araucaria.times.length >= 3 && pampa.times.length >= 3) {
                await prisma.jogo.update({
                    where: { id: jogosWCSul[0].id },
                    data: {
                        timeCasaId: araucaria.times[1].timeId,
                        timeVisitanteId: pampa.times[2].timeId,
                        status: 'AGENDADO'
                    }
                })

                await prisma.jogo.update({
                    where: { id: jogosWCSul[1].id },
                    data: {
                        timeCasaId: pampa.times[1].timeId,
                        timeVisitanteId: araucaria.times[2].timeId,
                        status: 'AGENDADO'
                    }
                })

                console.log('✅ Wild Cards Sul atualizados')
            }
        }

        if (classificacao['NORDESTE']) {
            const nordeste = classificacao['NORDESTE'][0] 

            const jogoWCNordeste = await prisma.jogo.findFirst({
                where: {
                    campeonatoId,
                    fase: 'WILD CARD',
                    conferencia: 'Nordeste',
                    timeCasa: {
                        nome: { in: ['TBD', 'A definir', 'A DEFINIR'] }
                    }
                }
            })

            if (jogoWCNordeste && nordeste.times.length >= 5) {
                await prisma.jogo.update({
                    where: { id: jogoWCNordeste.id },
                    data: {
                        timeCasaId: nordeste.times[3].timeId,
                        timeVisitanteId: nordeste.times[4].timeId,
                        status: 'AGENDADO'
                    }
                })

                console.log('✅ Wild Card Nordeste atualizado')
            }
        }

        console.log('✅ Wild Cards atualizados por conferência')

    } catch (error) {
        console.error('❌ Erro ao atualizar Wild Cards:', error)
        throw error
    }
}

async function contarJogosAtualizados(campeonatoId: number, fase: string): Promise<number> {
    return await prisma.jogo.count({
        where: {
            campeonatoId,
            fase,
            timeCasa: {
                nome: { not: { in: ['TBD', 'A definir', 'A DEFINIR'] } }
            },
            status: 'AGENDADO'
        }
    })
}

export async function verificarGeracaoPlayoffsPorConferencia(campeonatoId: number) {
    try {
        console.log('\n🔍 Verificando geração de playoffs por conferência...')

        const superliga = await prisma.campeonato.findFirst({
            where: {
                id: campeonatoId,
                isSuperliga: true
            },
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                }
            }
        })

        if (!superliga) {
            console.log('⚠️  Superliga não encontrada')
            return { playoffsGerados: false, conferenciasProcessadas: [] }
        }

        const jogosTemporadaRegular = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR',
                status: 'FINALIZADO'
            }
        })

        console.log(`📊 Status geral: ${jogosFinalizados}/${jogosTemporadaRegular} jogos finalizados`)

        if (jogosFinalizados >= 62 && jogosTemporadaRegular >= 64) {
            console.log('🏆 Temporada regular quase completa! Verificando playoffs...')

            const playoffsExistentes = await prisma.playoffJogo.count({
                where: { campeonatoId }
            })

            console.log(`📋 Playoffs existentes: ${playoffsExistentes}`)

            if (playoffsExistentes < 17) { 
                console.log('🚀 GERANDO TODOS OS PLAYOFFS DE UMA VEZ...')

                try {
                    const totalPlayoffJogos = await gerarTodosPlayoffs(campeonatoId)

                    await prisma.campeonato.update({
                        where: { id: campeonatoId },
                        data: {
                            status: 'PLAYOFFS',
                            configSuperliga: {
                                faseAtual: 'PLAYOFFS CONFERENCIA',
                                playoffsGeradosEm: new Date().toISOString(),
                                tipoGeracao: 'COMPLETO'
                            } as any
                        }
                    })

                    console.log(`🎉 TODOS OS PLAYOFFS GERADOS: ${totalPlayoffJogos} jogos`)

                    return {
                        playoffsGerados: true,
                        totalJogos: totalPlayoffJogos,
                        conferenciasProcessadas: [{
                            conferencia: 'TODAS',
                            jogosGerados: totalPlayoffJogos,
                            status: 'sucesso',
                            observacao: 'Todos os playoffs gerados de uma vez'
                        }]
                    }

                } catch (error) {
                    console.error('❌ Erro ao gerar todos os playoffs:', error)
                    
                    return await gerarPlayoffsPorConferencia(superliga, campeonatoId)
                }
            } else {
                console.log('✅ Playoffs já existem em quantidade adequada')
                return {
                    playoffsGerados: true,
                    totalJogos: playoffsExistentes,
                    conferenciasProcessadas: [{
                        conferencia: 'TODAS',
                        jogosGerados: playoffsExistentes,
                        status: 'ja_existentes'
                    }]
                }
            }
        } else {
            const faltam = jogosTemporadaRegular - jogosFinalizados
            console.log(`⏳ Aguardando mais ${faltam} jogos para gerar todos os playoffs`)
            
            return await gerarPlayoffsPorConferencia(superliga, campeonatoId)
        }

    } catch (error) {
        console.error('❌ Erro na verificação:', error)
        throw error
    }
}

async function gerarPlayoffsPorConferencia(superliga: any, campeonatoId: number) {
    const conferenciasProcessadas = []
    let totalPlayoffsGerados = 0

    function mapearNomeConferencia(tipoConferencia: string): string[] {
        const mapeamento = {
            'SUDESTE': ['Sudeste', 'SUDESTE'],
            'SUL': ['Sul', 'SUL'],
            'NORDESTE': ['Nordeste', 'NORDESTE'],
            'CENTRO NORTE': ['Centro-Norte', 'CENTRO NORTE', 'Centro Norte', 'CENTRO_NORTE']
        }
        return mapeamento[tipoConferencia as keyof typeof mapeamento] || [tipoConferencia]
    }

    for (const conferencia of superliga.conferencias) {
        const nomesConferencia = mapearNomeConferencia(conferencia.tipo)

        const jogosEsperados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR',
                conferencia: { in: nomesConferencia }
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA REGULAR',
                status: 'FINALIZADO',
                conferencia: { in: nomesConferencia }
            }
        })

        console.log(`🔍 Verificando conferência: ${conferencia.tipo}`)
        console.log(`   📊 ${conferencia.tipo}: ${jogosFinalizados}/${jogosEsperados} jogos finalizados`)

        const jogosPendentes = jogosEsperados - jogosFinalizados
        const podeGerarPlayoffs = jogosPendentes <= 2 && jogosFinalizados > 0

        console.log(`   📈 ${conferencia.tipo}: ${((jogosFinalizados / jogosEsperados) * 100).toFixed(1)}% concluído`)

        if (podeGerarPlayoffs) {
            console.log(`   🏆 ${conferencia.tipo}: Gerando playoffs...`)

            try {
                let resultado

                switch (conferencia.tipo) {
                    case 'SUDESTE':
                        const { gerarPlayoffsSudeste } = await import('./superligaUtils')
                        resultado = await gerarPlayoffsSudeste(campeonatoId, conferencia.id)
                        break

                    case 'SUL':
                        const { gerarPlayoffsSul } = await import('./superligaUtils')
                        resultado = await gerarPlayoffsSul(campeonatoId, conferencia.id)
                        break

                    case 'NORDESTE':
                        const { gerarPlayoffsNordeste } = await import('./superligaUtils')
                        resultado = await gerarPlayoffsNordeste(campeonatoId, conferencia.id)
                        break

                    case 'CENTRO NORTE':
                        const { gerarPlayoffsCentroNorte } = await import('./superligaUtils')
                        resultado = await gerarPlayoffsCentroNorte(campeonatoId, conferencia.id)
                        break

                    default:
                        console.log(`   ⚠️  Tipo não reconhecido: ${conferencia.tipo}`)
                        continue
                }

                if (resultado) {
                    const jogosGerados = resultado.wildcards.length + resultado.semifinais.length + (resultado.final ? 1 : 0)
                    totalPlayoffsGerados += jogosGerados

                    conferenciasProcessadas.push({
                        conferencia: conferencia.tipo,
                        jogosGerados,
                        status: 'sucesso'
                    })

                    console.log(`   ✅ ${conferencia.tipo}: ${jogosGerados} jogos gerados`)
                }

            } catch (error) {
                console.error(`   ❌ Erro em ${conferencia.tipo}:`, error)
                conferenciasProcessadas.push({
                    conferencia: conferencia.tipo,
                    jogosGerados: 0,
                    status: 'erro',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                })
            }
        } else {
            console.log(`   ⏳ ${conferencia.tipo}: Aguardando ${jogosPendentes} jogos`)
        }
    }

    const playoffsGerados = totalPlayoffsGerados > 0

    return {
        playoffsGerados,
        totalJogos: totalPlayoffsGerados,
        conferenciasProcessadas
    }
}