/**
 * Superliga.ts — schemas Zod  (D1 2026)
 * Substitui: src/schemas/Superliga.ts (backend)
 *
 * MUDANÇAS:
 *  - TipoConferencia: removidas CANASTRA / CANTAREIRA (não existem mais)
 *  - TipoRegional: removidas CANASTRA / CANTAREIRA; Sudeste só tem SERRAMAR
 *  - ESTRUTURA_SUPERLIGA: reflete 28 times / 6 regionais
 *  - totalTimes: 29 → 28; CERRADO: 5 → 4; SERRAMAR: 4 → 7
 */

import { z } from 'zod'

export const TipoConferenciaEnum = z.enum([
  'SUDESTE',
  'SUL',
  'NORDESTE',
  'CENTRO NORTE',
])

export const TipoRegionalEnum = z.enum([
  'SERRAMAR',
  'ARAUCARIA',
  'PAMPA',
  'ATLANTICO',
  'CERRADO',
  'AMAZONIA',
])

export type TipoConferencia = z.infer<typeof TipoConferenciaEnum>
export type TipoRegional = z.infer<typeof TipoRegionalEnum>

// Estrutura fixa da D1 2026 — usada nas rotas de criação/validação
export const ESTRUTURA_SUPERLIGA = {
  totalTimes: 28,
  conferencias: {
    SUDESTE: {
      nome: 'Conferência Sudeste',
      icone: '🏭',
      totalTimes: 7,
      regionais: {
        SERRAMAR: { nome: 'Regional Serramar', timesPorRegional: 7 },
      },
    },
    SUL: {
      nome: 'Conferência Sul',
      icone: '🧊',
      totalTimes: 8,
      regionais: {
        ARAUCARIA: { nome: 'Regional Araucária', timesPorRegional: 4 },
        PAMPA: { nome: 'Regional Pampa', timesPorRegional: 4 },
      },
    },
    NORDESTE: {
      nome: 'Conferência Nordeste',
      icone: '🌵',
      totalTimes: 6,
      regionais: {
        ATLANTICO: { nome: 'Regional Atlântico', timesPorRegional: 6 },
      },
    },
    'CENTRO NORTE': {
      nome: 'Conferência Centro-Norte',
      icone: '🌲',
      totalTimes: 7,
      regionais: {
        CERRADO: { nome: 'Regional Cerrado', timesPorRegional: 4 },
        AMAZONIA: { nome: 'Regional Amazônia', timesPorRegional: 3 },
      },
    },
  },
} as const

// Schemas de request
export const CriarSuperligaSchema = z.object({
  temporada: z.string().min(4).max(4),
  nome: z.string().optional().default('Superliga de Futebol Americano'),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  descricao: z.string().optional(),
})

export const DistribuirTimesSchema = z.object({
  campeonatoId: z.number().int().positive(),
  temporada: z.string().min(4),
  distribuicao: z.record(TipoRegionalEnum, z.array(z.number().int().positive())).optional(),
})

export type CriarSuperligaInput = z.infer<typeof CriarSuperligaSchema>
export type DistribuirTimesInput = z.infer<typeof DistribuirTimesSchema>