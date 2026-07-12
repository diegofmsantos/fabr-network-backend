/**
 * superligaUtilsD2.ts
 * Distribuição automática dos 26 times D2
 * Salvar em: src/utils/superligaUtilsD2.ts (backend)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DISTRIBUICAO_D2: Record<string, { regionais: Record<string, string[]> }> = {
    'NORTE': {
        regionais: {
            'SAO_PAULO': ['Caniballs FA', 'Corinthians Steamrollers', 'Spartans FA B', 'Tatuapé Monsters', 'Vikings FA'],
            'VALES': ['Moura Lacerda Dragons', 'Ponte Preta Gorilas', 'Taubaté FA'],  // saíram Leme Lizards e São José Jets
            'SERRAMAR_D2': ['Macaé Oilers', 'Tritões FA'],
            'MOGIANA': ['Brasília Leões', 'Cruzeiro FA'],
        },
    },
    'SUL': {
        regionais: {
            'OESTE': ['Cascavel Olympians', 'Chape FA', 'Francisco Beltrão Red Feet'],
            'ARAUCARIA_D2': ['Coritiba Crocodiles B', 'Curitiba Brown Spiders B', 'Curitiba Lions', 'Joinville Gladiators'],
            'PARANAPANEMA': ['Arapongas Golden Phoenix', 'Calvary Cavaliers', 'Maringá Pyros', 'Ponta Grossa Phantoms'],
            'PAMPA_D2': ['Bears FA', 'Erechim Coroados', 'Underdogs FA'],  // Porto Alegre Gorillas → Underdogs FA
        },
    },
}

export async function distribuirTimesD2(campeonatoId: number, temporada: string) {
    console.log(`🚀 Iniciando distribuição D2 — campeonato ${campeonatoId}, temporada ${temporada}`)

    const superliga = await prisma.campeonato.findUnique({
        where: { id: campeonatoId },
        include: { conferencias: { include: { regionais: true } } },
    })

    if (!superliga) throw new Error('Campeonato D2 não encontrado')

    const todosTimes = await prisma.time.findMany({
        where: { temporada, divisao: 'D2' },
        select: { id: true, nome: true },
    })

    console.log(`📋 Times D2 encontrados: ${todosTimes.length}`)

    let distribuidos = 0
    const erros: string[] = []

    for (const [confTipo, confConfig] of Object.entries(DISTRIBUICAO_D2)) {
        const conferencia = superliga.conferencias.find(c => c.tipo === confTipo)
        if (!conferencia) { erros.push(`Conferência ${confTipo} não encontrada`); continue }

        for (const [regTipo, timesEsperados] of Object.entries(confConfig.regionais)) {
            const regional = conferencia.regionais.find(r => r.tipo === regTipo)
            if (!regional) { erros.push(`Regional ${regTipo} não encontrado`); continue }

            for (const nomeTime of timesEsperados) {
                const time = todosTimes.find(t => t.nome === nomeTime)
                if (!time) { erros.push(`Time não encontrado: "${nomeTime}"`); continue }

                const existente = await prisma.distribuicaoTime.findFirst({
                    where: { campeonatoId, timeId: time.id, temporada },
                })
                if (existente) { console.log(`⚠️  ${nomeTime} já distribuído`); continue }

                await prisma.distribuicaoTime.create({
                    data: {
                        campeonatoId,
                        conferenciaId: conferencia.id,
                        regionalId: regional.id,
                        timeId: time.id,
                        temporada,
                        conferenciaType: confTipo,
                        regionalType: regTipo,
                    },
                })

                distribuidos++
                console.log(`✅ ${nomeTime} → ${confTipo} / ${regTipo}`)
            }
        }
    }

    console.log(`\n📊 Distribuição D2 concluída: ${distribuidos} times`)
    if (erros.length) console.warn(`⚠️  Erros: ${erros.join(' | ')}`)

    return { distribuidos, erros }
}