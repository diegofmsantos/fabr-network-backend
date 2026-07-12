/**
 * superligaUtils.ts — D1 2026
 * Substitui: src/utils/superligaUtils.ts (backend)
 *
 * MUDANÇAS:
 *  - Total: 28 → 26 times
 *  - Araucária: saiu Londrina Bristlebacks (4 → 3 times)
 *  - Amazônia: saiu Manaus Cavaliers (3 → 2 times)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DISTRIBUICAO_CONFIG: Record<string, { regionais: Record<string, string[]> }> = {
  'SUDESTE': {
    regionais: {
      'SERRAMAR': [
        'Locomotiva FA',
        'Spartans FA',
        'Flamengo Imperadores',
        'Galo FA',
        'Vasco Almirantes',
        'Guarulhos Rhynos',
        'Ocelots FA',
      ],
    },
  },
  'SUL': {
    regionais: {
      'ARAUCARIA': [
        'Coritiba Crocodiles',
        'Curitiba Brown Spiders',
        'Istepôs FA',
        // saiu Londrina Bristlebacks
      ],
      'PAMPA': [
        'Santa Maria Soldiers',
        'Juventude FA',
        'Bravos FA',
        'Timbó Rex',
      ],
    },
  },
  'NORDESTE': {
    regionais: {
      'ATLANTICO': [
        'Recife Mariners',
        'Fortaleza Tritões',
        'João Pessoa Espectros',
        'Cavalaria 2 de Julho',
        'Ceará Sabres',
        'Caruaru Wolves',
      ],
    },
  },
  'CENTRO NORTE': {
    regionais: {
      'CERRADO': [
        'Rondonópolis Hawks',
        'Cuiabá Arsenal',
        'Tubarões do Cerrado',
        'Goiás FA',
      ],
      'AMAZONIA': [
        'Porto Velho Miners',
        'Manaus FA',
        // saiu Manaus Cavaliers
      ],
    },
  },
}

export async function distribuirTimesAutomatico(campeonatoId: number, temporada: string) {
  console.log(`🚀 Iniciando distribuição automática — campeonato ${campeonatoId}, temporada ${temporada}`)

  const superliga = await prisma.campeonato.findUnique({
    where: { id: campeonatoId },
    include: {
      conferencias: {
        include: { regionais: true },
      },
    },
  })

  if (!superliga) throw new Error('Campeonato não encontrado')

  const todosTimes = await prisma.time.findMany({
    where: { temporada, divisao: 'D1' },
    select: { id: true, nome: true },
  })

  console.log(`📋 Times encontrados no banco: ${todosTimes.length}`)

  let timesDistribuidos = 0
  const erros: string[] = []

  for (const [confTipo, confConfig] of Object.entries(DISTRIBUICAO_CONFIG)) {
    const conferencia = superliga.conferencias.find(c => c.tipo === confTipo)
    if (!conferencia) {
      erros.push(`Conferência ${confTipo} não encontrada`)
      continue
    }

    for (const [regTipo, timesEsperados] of Object.entries(confConfig.regionais)) {
      const regional = conferencia.regionais.find(r => r.tipo === regTipo)
      if (!regional) {
        erros.push(`Regional ${regTipo} não encontrado na conferência ${confTipo}`)
        continue
      }

      for (const nomeTime of timesEsperados) {
        const time = todosTimes.find(t => t.nome === nomeTime)
        if (!time) {
          erros.push(`Time não encontrado: "${nomeTime}"`)
          continue
        }

        const existente = await prisma.distribuicaoTime.findFirst({
          where: { campeonatoId, timeId: time.id, temporada },
        })

        if (existente) {
          console.log(`⚠️  ${nomeTime} já distribuído, pulando`)
          continue
        }

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

        timesDistribuidos++
        console.log(`✅ ${nomeTime} → ${confTipo} / ${regTipo}`)
      }
    }
  }

  console.log(`\n📊 Distribuição concluída: ${timesDistribuidos} times`)
  if (erros.length) console.warn(`⚠️  Erros: ${erros.join(' | ')}`)

  return { timesDistribuidos, erros }
}