import { PrismaClient } from '@prisma/client'

const INICIO_DIACRITICOS = String.fromCharCode(0x0300)
const FIM_DIACRITICOS = String.fromCharCode(0x036f)
const REGEX_DIACRITICOS = new RegExp(`[${INICIO_DIACRITICOS}-${FIM_DIACRITICOS}]`, 'g')

export function gerarSlug(nome: string): string {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(REGEX_DIACRITICOS, '')      // remove acentos
        .replace(/[^a-z0-9\s-]/g, '')        // remove caracteres especiais
        .trim()
        .replace(/\s+/g, '-')                // espaços → hífens
}

export function montarCamisa(nomeTime: string, numero: number): string {
    return numero > 0 ? `camisa-${gerarSlug(nomeTime)}-${numero}.png` : ''
}

export function criarEstatisticasZeradas() {
    return {
        passe: {
            passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0,
            td_passados: 0, interceptacoes_sofridas: 0, sacks_sofridos: 0,
            fumble_de_passador: 0
        },
        corrida: {
            corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0
        },
        recepcao: {
            recepcoes: 0, alvo: 0, jardas_recebidas: 0, tds_recebidos: 0
        },
        retorno: {
            retornos: 0, jardas_retornadas: 0, td_retornados: 0
        },
        defesa: {
            tackles_totais: 0, tackles_for_loss: 0, sacks_forcado: 0,
            fumble_forcado: 0, interceptacao_forcada: 0, passe_desviado: 0,
            safety: 0, td_defensivo: 0
        },
        kicker: {
            xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0,
            tentativas_de_fg: 0, fg_mais_longo: 0
        },
        punter: {
            punts: 0, jardas_de_punt: 0
        }
    }
}

interface ObterOuCriarJogadorTimeParams {
    prisma: PrismaClient
    nomeJogador: string
    nomeTime: string
    temporada: string
    numero?: number
    posicao?: string
    setor?: string
}

/**
 * Usado na importação de estatísticas (planilha só tem nome + time, sem cadastro
 * prévio do jogador — fluxo 2026, onde jogadores se inscrevem ao longo da temporada).
 *
 * Busca o jogador já vinculado a ESSE time nesta temporada. Se não achar, tenta achar
 * o Jogador por nome em qualquer time (evita duplicar em caso de transferência) e cria
 * só o vínculo (JogadorTime) novo. Se o Jogador também não existir, cria os dois do zero
 * com dados pessoais em branco (idade/altura/peso/instagram etc ficam para completar
 * depois manualmente pela tela de editar jogador).
 *
 * Quando o jogador já existe, numero/camisa/posicao/setor são resincronizados com o que
 * vier na planilha da semana (em vez de ficar travado no valor da primeira aparição).
 */
export async function obterOuCriarJogadorTime(params: ObterOuCriarJogadorTimeParams) {
    const { prisma, nomeJogador, nomeTime, temporada, numero, posicao, setor } = params

    const time = await prisma.time.findFirst({
        where: { nome: { equals: nomeTime, mode: 'insensitive' }, temporada }
    })

    if (!time) {
        throw new Error(`Time "${nomeTime}" não encontrado na temporada ${temporada}`)
    }

    let jogador = await prisma.jogador.findFirst({
        where: {
            nome: { equals: nomeJogador, mode: 'insensitive' },
            times: { some: { timeId: time.id, temporada } }
        }
    })

    let jogadorTime = jogador
        ? await prisma.jogadorTime.findFirst({ where: { jogadorId: jogador.id, timeId: time.id, temporada } })
        : null

    if (jogador && jogadorTime) {
        const numeroAtualizado = numero && numero > 0 ? numero : jogadorTime.numero
        const camisaAtualizada = numero && numero > 0 ? montarCamisa(time.nome, numero) : jogadorTime.camisa

        jogadorTime = await prisma.jogadorTime.update({
            where: { id: jogadorTime.id },
            data: { numero: numeroAtualizado, camisa: camisaAtualizada }
        })

        if (posicao || setor) {
            jogador = await prisma.jogador.update({
                where: { id: jogador.id },
                data: {
                    ...(posicao ? { posicao } : {}),
                    ...(setor ? { setor } : {})
                }
            })
        }

        return { jogador, jogadorTime, criado: false }
    }

    // Não vinculado a ESSE time — tenta achar o Jogador em qualquer time antes de criar (transferência)
    if (!jogador) {
        jogador = await prisma.jogador.findFirst({
            where: { nome: { equals: nomeJogador, mode: 'insensitive' } }
        })
    }

    if (!jogador) {
        jogador = await prisma.jogador.create({
            data: {
                nome: nomeJogador,
                posicao: posicao || '',
                setor: setor || 'Ataque'
            }
        })
    }

    const numeroFinal = numero || 0
    jogadorTime = await prisma.jogadorTime.create({
        data: {
            jogadorId: jogador.id,
            timeId: time.id,
            temporada,
            numero: numeroFinal,
            camisa: montarCamisa(time.nome, numeroFinal),
            estatisticas: criarEstatisticasZeradas()
        }
    })

    return { jogador, jogadorTime, criado: true }
}
