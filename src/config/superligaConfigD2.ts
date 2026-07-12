/**
 * superligaConfigD2.ts
 * Configuração da Superliga D2 2026
 * Salvar em: src/config/superligaConfigD2.ts (backend)
 *
 * Estrutura:
 *   Conferência Norte (12 times, 4 regionais)
 *   Conferência Sul   (14 times, 4 regionais)
 *   Total: 26 times
 */

export type TipoConferenciaD2 = 'NORTE' | 'SUL'

export type TipoRegionalD2 =
    | 'SAO_PAULO' | 'VALES' | 'SERRAMAR_D2' | 'MOGIANA'
    | 'OESTE' | 'ARAUCARIA_D2' | 'PARANAPANEMA' | 'PAMPA_D2'

export const TOTAL_TIMES_D2 = 26

export const TIMES_D2: Record<TipoRegionalD2, string[]> = {
    // Norte — Regional São Paulo (5 times)
    SAO_PAULO: [
        'Caniballs FA',
        'Corinthians Steamrollers',
        'Spartans FA B',
        'Tatuapé Monsters',
        'Vikings FA',
    ],
    // Norte — Regional Vales (3 times) — saíram Leme Lizards e São José Jets
    VALES: [
        'Moura Lacerda Dragons',
        'Ponte Preta Gorilas',
        'Taubaté FA',
    ],
    // Norte — Regional Serramar D2 (2 times)
    SERRAMAR_D2: [
        'Macaé Oilers',
        'Tritões FA',
    ],
    // Norte — Regional Mogiana (2 times)
    MOGIANA: [
        'Brasília Leões',
        'Cruzeiro FA',
    ],

    // Sul — Regional Oeste (3 times)
    OESTE: [
        'Cascavel Olympians',
        'Chape FA',
        'Francisco Beltrão Red Feet',
    ],
    // Sul — Regional Araucária D2 (4 times)
    ARAUCARIA_D2: [
        'Coritiba Crocodiles B',
        'Curitiba Brown Spiders B',
        'Curitiba Lions',
        'Joinville Gladiators',
    ],
    // Sul — Regional Paranapanema (4 times)
    PARANAPANEMA: [
        'Arapongas Golden Phoenix',
        'Calvary Cavaliers',
        'Maringá Pyros',
        'Ponta Grossa Phantoms',
    ],
    // Sul — Regional Pampa D2 (3 times) — Porto Alegre Gorillas → Underdogs FA
    PAMPA_D2: [
        'Bears FA',
        'Erechim Coroados',
        'Underdogs FA',
    ],
}

export interface RegionalConfigD2 {
    tipo: TipoRegionalD2
    nome: string
    conferencia: TipoConferenciaD2
    timesPorRegional: number
    times: string[]
}

export interface ConferenciaConfigD2 {
    tipo: TipoConferenciaD2
    nome: string
    icone: string
    totalTimes: number
    regionais: RegionalConfigD2[]
}

export const SUPERLIGA_CONFIG_D2: ConferenciaConfigD2[] = [
    {
        tipo: 'NORTE',
        nome: 'Conferência Norte',
        icone: '🔥',
        totalTimes: 12,
        regionais: [
            { tipo: 'SAO_PAULO', nome: 'Regional São Paulo', conferencia: 'NORTE', timesPorRegional: 5, times: TIMES_D2.SAO_PAULO },
            { tipo: 'VALES', nome: 'Regional Vales', conferencia: 'NORTE', timesPorRegional: 3, times: TIMES_D2.VALES },
            { tipo: 'SERRAMAR_D2', nome: 'Regional Serramar', conferencia: 'NORTE', timesPorRegional: 2, times: TIMES_D2.SERRAMAR_D2 },
            { tipo: 'MOGIANA', nome: 'Regional Mogiana', conferencia: 'NORTE', timesPorRegional: 2, times: TIMES_D2.MOGIANA },
        ],
    },
    {
        tipo: 'SUL',
        nome: 'Conferência Sul',
        icone: '🧊',
        totalTimes: 14,
        regionais: [
            { tipo: 'OESTE', nome: 'Regional Oeste', conferencia: 'SUL', timesPorRegional: 3, times: TIMES_D2.OESTE },
            { tipo: 'ARAUCARIA_D2', nome: 'Regional Araucária', conferencia: 'SUL', timesPorRegional: 4, times: TIMES_D2.ARAUCARIA_D2 },
            { tipo: 'PARANAPANEMA', nome: 'Regional Paranapanema', conferencia: 'SUL', timesPorRegional: 4, times: TIMES_D2.PARANAPANEMA },
            { tipo: 'PAMPA_D2', nome: 'Regional Pampa', conferencia: 'SUL', timesPorRegional: 3, times: TIMES_D2.PAMPA_D2 },
        ],
    },
]

export function getTotalTimesD2(): number {
    return SUPERLIGA_CONFIG_D2.reduce((acc, c) => acc + c.totalTimes, 0)
}