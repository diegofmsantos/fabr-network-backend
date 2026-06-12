// src/utils/superligaUtils.ts
//
// Distribuição automática de times nos regionais (temporada 2026).
// A agenda importada traz apenas a CONFERÊNCIA; o regional de cada time
// é definido aqui, a partir da fonte única src/config/superligaConfig.ts.
//
// NOTA: este arquivo assume que ele contém SOMENTE a função
// distribuirTimesAutomaticamente. Se o seu arquivo tiver outras exportações,
// mantenha-as e troque apenas o miolo desta função + os imports.

import { PrismaClient } from '@prisma/client'
import {
  getDistribuicaoConfig,
  TOTAL_TIMES_SUPERLIGA,
} from '../config/superligaConfig'

const prisma = new PrismaClient()

export async function distribuirTimesAutomaticamente(campeonatoId: number, temporada: string) {
  try {
    console.log(`Iniciando distribuição automática de times para a temporada ${temporada}`)

    const superliga = await prisma.campeonato.findUnique({
      where: { id: campeonatoId },
      include: {
        conferencias: {
          include: { regionais: true },
        },
      },
    })

    if (!superliga) {
      throw new Error('Superliga não encontrada')
    }

    const todosTimes = await prisma.time.findMany({
      where: { temporada },
    })

    console.log(`Encontrados ${todosTimes.length} times para distribuir`)

    if (todosTimes.length !== TOTAL_TIMES_SUPERLIGA) {
      throw new Error(`Esperados ${TOTAL_TIMES_SUPERLIGA} times, encontrados ${todosTimes.length}`)
    }

    await prisma.distribuicaoTime.deleteMany({
      where: { campeonatoId },
    })

    const DISTRIBUICAO_CONFIG = getDistribuicaoConfig()

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
              regionalType: regTipo,
            },
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

    if (timesDistribuidos !== TOTAL_TIMES_SUPERLIGA) {
      throw new Error(`Distribuição incompleta: ${timesDistribuidos}/${TOTAL_TIMES_SUPERLIGA} times`)
    }

    console.log(`Distribuição automática concluída: ${timesDistribuidos} times distribuídos`)

    return {
      timesDistribuidos,
      conferencias: Object.keys(DISTRIBUICAO_CONFIG).length,
      regionais: Object.values(DISTRIBUICAO_CONFIG).reduce(
        (acc, conf) => acc + Object.keys(conf.regionais).length,
        0,
      ),
      sucesso: true,
    }
  } catch (error) {
    console.error('❌ Erro na distribuição automática:', error)
    throw error
  }
}