/**
 * superligaConfig.ts  —  D1 2026
 * Substitui: src/config/superligaConfig.ts (backend)
 *
 * MUDANÇAS vs. versão anterior:
 *  - Total: 28 → 26 times
 *  - Araucária: 4 → 3 times (saiu Londrina Bristlebacks)
 *  - Amazônia: 3 → 2 times (saiu Manaus Cavaliers)
 *  - Sul: 8 → 7 times total
 *  - Centro-Norte: 7 → 6 times total
 */

export type TipoConferencia = 'SUDESTE' | 'SUL' | 'NORDESTE' | 'CENTRO NORTE'

export type TipoRegional =
  | 'SERRAMAR'
  | 'ARAUCARIA' | 'PAMPA'
  | 'ATLANTICO'
  | 'CERRADO' | 'AMAZONIA'

export const TOTAL_TIMES_SUPERLIGA = 26

export const TIMES_SUPERLIGA: Record<TipoRegional, string[]> = {
  // Sudeste — 7 times, 1 regional
  SERRAMAR: [
    'Locomotiva FA',
    'Spartans FA',
    'Flamengo Imperadores',
    'Galo FA',
    'Vasco Almirantes',
    'Guarulhos Rhynos',
    'Ocelots FA',
  ],

  // Sul — 7 times, 2 regionais
  ARAUCARIA: [
    'Coritiba Crocodiles',
    'Curitiba Brown Spiders',
    'Istepôs FA',
    // saiu Londrina Bristlebacks
  ],
  PAMPA: [
    'Santa Maria Soldiers',
    'Juventude FA',
    'Bravos FA',
    'Timbó Rex',
  ],

  // Nordeste — 6 times, 1 regional
  ATLANTICO: [
    'Recife Mariners',
    'Fortaleza Tritões',
    'João Pessoa Espectros',
    'Cavalaria 2 de Julho',
    'Ceará Sabres',
    'Caruaru Wolves',
  ],

  // Centro-Norte — 6 times, 2 regionais
  CERRADO: [
    'Rondonópolis Hawks',
    'Cuiabá Arsenal',
    'Tubarões do Cerrado',
    'Goiás FA',
  ],
  AMAZONIA: [
    'Porto Velho Miners',
    'Manaus FA',
    // saiu Manaus Cavaliers
  ],
}

export interface RegionalConfig {
  tipo: TipoRegional
  nome: string
  conferencia: TipoConferencia
  timesPorRegional: number
  times: string[]
}

export interface PlayoffConfig {
  semifinalDireta: number
  wildcardVagas: number
  estrutura: 'CONFERENCIA' | 'REGIONAL' | 'GERAL'
}

export interface ConferenciaConfig {
  tipo: TipoConferencia
  nome: string
  icone: string
  totalTimes: number
  regionais: RegionalConfig[]
  playoffConfig: PlayoffConfig
}

export const SUPERLIGA_CONFIG: ConferenciaConfig[] = [
  {
    tipo: 'SUDESTE',
    nome: 'Conferência Sudeste',
    icone: '🏭',
    totalTimes: 7,
    regionais: [
      {
        tipo: 'SERRAMAR',
        nome: 'Regional Serramar',
        conferencia: 'SUDESTE',
        timesPorRegional: 7,
        times: TIMES_SUPERLIGA.SERRAMAR,
      },
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 4,
      estrutura: 'CONFERENCIA',
    },
  },

  {
    tipo: 'SUL',
    nome: 'Conferência Sul',
    icone: '🧊',
    totalTimes: 7,
    regionais: [
      {
        tipo: 'ARAUCARIA',
        nome: 'Regional Araucária',
        conferencia: 'SUL',
        timesPorRegional: 3,
        times: TIMES_SUPERLIGA.ARAUCARIA,
      },
      {
        tipo: 'PAMPA',
        nome: 'Regional Pampa',
        conferencia: 'SUL',
        timesPorRegional: 4,
        times: TIMES_SUPERLIGA.PAMPA,
      },
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 4,
      estrutura: 'CONFERENCIA',
    },
  },

  {
    tipo: 'NORDESTE',
    nome: 'Conferência Nordeste',
    icone: '🌵',
    totalTimes: 6,
    regionais: [
      {
        tipo: 'ATLANTICO',
        nome: 'Regional Atlântico',
        conferencia: 'NORDESTE',
        timesPorRegional: 6,
        times: TIMES_SUPERLIGA.ATLANTICO,
      },
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 2,
      estrutura: 'CONFERENCIA',
    },
  },

  {
    tipo: 'CENTRO NORTE',
    nome: 'Conferência Centro-Norte',
    icone: '🌲',
    totalTimes: 6,
    regionais: [
      {
        tipo: 'CERRADO',
        nome: 'Regional Cerrado',
        conferencia: 'CENTRO NORTE',
        timesPorRegional: 4,
        times: TIMES_SUPERLIGA.CERRADO,
      },
      {
        tipo: 'AMAZONIA',
        nome: 'Regional Amazônia',
        conferencia: 'CENTRO NORTE',
        timesPorRegional: 2,
        times: TIMES_SUPERLIGA.AMAZONIA,
      },
    ],
    playoffConfig: {
      semifinalDireta: 0,
      wildcardVagas: 2,
      estrutura: 'CONFERENCIA',
    },
  },
]

// ── Utilitários ──────────────────────────────────────────

export function getConferenciaConfig(tipo: TipoConferencia): ConferenciaConfig {
  const conf = SUPERLIGA_CONFIG.find(c => c.tipo === tipo)
  if (!conf) throw new Error(`Conferência ${tipo} não encontrada`)
  return conf
}

export function getRegionalConfig(tipo: TipoRegional): RegionalConfig {
  for (const conf of SUPERLIGA_CONFIG) {
    const regional = conf.regionais.find(r => r.tipo === tipo)
    if (regional) return regional
  }
  throw new Error(`Regional ${tipo} não encontrada`)
}

export function getTimesByRegional(regional: TipoRegional): string[] {
  return TIMES_SUPERLIGA[regional] ?? []
}

export function getTotalTimes(): number {
  return SUPERLIGA_CONFIG.reduce((acc, c) => acc + c.totalTimes, 0)
}