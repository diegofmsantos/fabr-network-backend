import { PrismaClient } from '@prisma/client'

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
                    'AMAZONIA': ['Porto Velho Miners', 'Manaus FA', 'São Raimundo Cavaliers']
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

