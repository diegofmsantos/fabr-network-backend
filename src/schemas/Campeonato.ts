import { z } from 'zod'

export const CampeonatoSchema = z.object({
    id: z.number().optional(),
    nome: z.string().min(1, "Nome é obrigatório"),
    temporada: z.string().min(4, "Temporada deve ter 4 dígitos"),
    tipo: z.enum(['REGULAR', 'PLAYOFFS', 'COPA']),
    status: z.enum(['NAO_INICIADO', 'EM_ANDAMENTO', 'FINALIZADO']).default('NAO_INICIADO'),
    dataInicio: z.date().or(z.string()),
    dataFim: z.date().or(z.string()).optional(),
    descricao: z.string().optional(),
    formato: z.object({
        tipoDisputa: z.enum(['PONTOS_CORRIDOS', 'MATA_MATA', 'MISTO']),
        numeroRodadas: z.number().min(1),
        temGrupos: z.boolean().default(false),
        numeroGrupos: z.number().optional(),
        timesGrupo: z.number().optional(),
        classificadosGrupo: z.number().optional(),
        temPlayoffs: z.boolean().default(false),
        formatoPlayoffs: z.string().optional()
    })
})

export const GrupoSchema = z.object({
    id: z.number().optional(),
    nome: z.string().min(1, "Nome do grupo é obrigatório"),
    campeonatoId: z.number(),
    ordem: z.number().default(1),
    times: z.array(z.number()).optional() // Array de IDs dos times
})

export const JogoSchema = z.object({
    id: z.number().optional(),
    campeonatoId: z.number(),
    grupoId: z.number().optional(),
    timeVisitanteId: z.number(),
    timeCasaId: z.number(),
    dataJogo: z.date().or(z.string()),
    local: z.string().optional(),
    rodada: z.number().min(1),
    fase: z.enum(['FASE_GRUPOS', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL']).default('FASE_GRUPOS'),
    status: z.enum(['AGENDADO', 'AO_VIVO', 'FINALIZADO', 'ADIADO']).default('AGENDADO'),
    placarCasa: z.number().min(0).optional(),
    placarVisitante: z.number().min(0).optional(),
    observacoes: z.string().optional()
})

export const EstatisticaJogoSchema = z.object({
    jogoId: z.number(),
    jogadorId: z.number(),
    timeId: z.number(),
    estatisticas: z.object({
        passe: z.object({
            passes_completos: z.number().default(0),
            passes_tentados: z.number().default(0),
            jardas_de_passe: z.number().default(0),
            td_passados: z.number().default(0),
            interceptacoes_sofridas: z.number().default(0),
            sacks_sofridos: z.number().default(0),
            fumble_de_passador: z.number().default(0)
        }).optional(),
        corrida: z.object({
            corridas: z.number().default(0),
            jardas_corridas: z.number().default(0),
            tds_corridos: z.number().default(0),
            fumble_de_corredor: z.number().default(0)
        }).optional(),
        recepcao: z.object({
            recepcoes: z.number().default(0),
            alvo: z.number().default(0),
            jardas_recebidas: z.number().default(0),
            tds_recebidos: z.number().default(0)
        }).optional(),
        retorno: z.object({
            retornos: z.number().default(0),
            jardas_retornadas: z.number().default(0),
            td_retornados: z.number().default(0)
        }).optional(),
        defesa: z.object({
            tackles_totais: z.number().default(0),
            tackles_for_loss: z.number().default(0),
            sacks_forcado: z.number().default(0),
            fumble_forcado: z.number().default(0),
            interceptacao_forcada: z.number().default(0),
            passe_desviado: z.number().default(0),
            safety: z.number().default(0),
            td_defensivo: z.number().default(0)
        }).optional(),
        kicker: z.object({
            xp_bons: z.number().default(0),
            tentativas_de_xp: z.number().default(0),
            fg_bons: z.number().default(0),
            tentativas_de_fg: z.number().default(0),
            fg_mais_longo: z.number().default(0)
        }).optional(),
        punter: z.object({
            punts: z.number().default(0),
            jardas_de_punt: z.number().default(0)
        }).optional()
    })
})

export type Campeonato = z.infer<typeof CampeonatoSchema>
export type Grupo = z.infer<typeof GrupoSchema>
export type Jogo = z.infer<typeof JogoSchema>
export type EstatisticaJogo = z.infer<typeof EstatisticaJogoSchema>