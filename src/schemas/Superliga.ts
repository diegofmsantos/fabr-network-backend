import { z } from 'zod'

// ==================== ENUMS ====================

export const TipoConferenciaEnum = z.enum(['SUDESTE', 'SUL', 'NORDESTE', 'CENTRO_NORTE'])
export const TipoRegionalEnum = z.enum([
  'SERRAMAR', 'CANASTRA', 'CANTAREIRA',
  'ARAUCARIA', 'PAMPA',
  'ATLANTICO',
  'CERRADO', 'AMAZONIA'
])

export const FaseSuperligaEnum = z.enum([
  'CONFIGURACAO',
  'TEMPORADA_REGULAR', 
  'PLAYOFFS_CONFERENCIA',
  'FASE_NACIONAL',
  'FINALIZADO'
])

export const TipoJogoSuperligaEnum = z.enum([
  'TEMPORADA_REGULAR',
  'WILD_CARD',
  'SEMIFINAL_CONFERENCIA',
  'FINAL_CONFERENCIA',
  'SEMIFINAL_NACIONAL',
  'FINAL_NACIONAL'
])

// ==================== SCHEMAS DE CRIAÇÃO ====================

export const CriarSuperligaSchema = z.object({
  temporada: z.string().regex(/^\d{4}$/, 'Temporada deve ser um ano válido'),
  nome: z.string().optional(),
  dataInicio: z.string().datetime().optional(),
  descricao: z.string().optional()
})

export const DistribuirTimesSchema = z.object({
  campeonatoId: z.number().positive(),
  distribuicao: z.record(TipoRegionalEnum, z.array(z.number().positive()))
})

export const GerarJogosSchema = z.object({
  campeonatoId: z.number().positive(),
  rodadas: z.number().min(1).max(10).default(4),
  algoritmo: z.enum(['ROUND_ROBIN', 'CUSTOM']).default('ROUND_ROBIN')
})

export const GerarPlayoffsSchema = z.object({
  campeonatoId: z.number().positive(),
  conferencia: TipoConferenciaEnum
})

// ==================== SCHEMAS DE ATUALIZAÇÃO ====================

export const AtualizarJogoPlayoffSchema = z.object({
  jogoId: z.number().positive(),
  placarTime1: z.number().min(0),
  placarTime2: z.number().min(0),
  observacoes: z.string().optional()
})

export const AtualizarStatusSuperligaSchema = z.object({
  campeonatoId: z.number().positive(),
  novaFase: FaseSuperligaEnum
})

// ==================== SCHEMAS DE RESPONSE ====================

export const ClassificacaoRegionalSchema = z.object({
  regionalId: z.number(),
  regional: TipoRegionalEnum,
  conferencia: TipoConferenciaEnum,
  times: z.array(z.object({
    posicao: z.number(),
    timeId: z.number(),
    time: z.object({
      id: z.number(),
      nome: z.string(),
      sigla: z.string(),
      logo: z.string()
    }),
    jogos: z.number(),
    vitorias: z.number(),
    derrotas: z.number(),
    pontosPro: z.number(),
    pontosContra: z.number(),
    saldo: z.number(),
    aproveitamento: z.number()
  }))
})

export const SuperligaStatusSchema = z.object({
  campeonatoId: z.number(),
  fase: FaseSuperligaEnum,
  jogosTemporadaRegular: z.object({
    total: z.number(),
    finalizados: z.number(),
    percentual: z.number()
  }),
  playoffsStatus: z.record(TipoConferenciaEnum, z.object({
    wildcardCompleto: z.boolean(),
    semifinalCompleto: z.boolean(),
    finalCompleto: z.boolean(),
    campeao: z.object({
      id: z.number(),
      nome: z.string(),
      sigla: z.string()
    }).optional()
  })).optional(),
  faseNacionalStatus: z.object({
    semifinaisCompletas: z.boolean(),
    campeaoNacional: z.object({
      id: z.number(),
      nome: z.string(),
      sigla: z.string()
    }).optional()
  }).optional()
})

// ==================== TYPE EXPORTS ====================

export type CriarSuperligaInput = z.infer<typeof CriarSuperligaSchema>
export type DistribuirTimesInput = z.infer<typeof DistribuirTimesSchema>
export type GerarJogosInput = z.infer<typeof GerarJogosSchema>
export type GerarPlayoffsInput = z.infer<typeof GerarPlayoffsSchema>
export type AtualizarJogoPlayoffInput = z.infer<typeof AtualizarJogoPlayoffSchema>
export type ClassificacaoRegionalResponse = z.infer<typeof ClassificacaoRegionalSchema>
export type SuperligaStatusResponse = z.infer<typeof SuperligaStatusSchema>