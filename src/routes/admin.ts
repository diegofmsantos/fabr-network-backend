import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx'
import multer from 'multer'
import { calcularClassificacaoPorConferencia } from '../utils/distribuicaoUtils';
import { requireAuth } from '../middleware/auth'
import { gerarSlug, obterOuCriarJogadorTime } from '../utils/jogadorUtils'

import { prisma } from '../libs/prisma'

export const adminRouter = express.Router()

adminRouter.use(requireAuth)

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 }
});

// Barreira contra lixo vindo da planilha: célula formatada como data no Excel
// chega como número serial (ex: "2,5" vira 05/02 = 46058) e "2,5" como texto
// vira NaN. Nenhuma estatística de um jogo chega perto desse limite.
const LIMITE_ESTATISTICA_POR_JOGO = 20000
function validarEstatisticasJogo(estatisticas: Record<string, Record<string, number>>, nomeJogador: string) {
    for (const [categoria, campos] of Object.entries(estatisticas)) {
        for (const [campo, valor] of Object.entries(campos)) {
            if (!Number.isFinite(valor) || valor < 0 || valor >= LIMITE_ESTATISTICA_POR_JOGO) {
                throw new Error(
                    `Valor inválido em "${categoria}.${campo}" para ${nomeJogador}: ${valor}. ` +
                    `Provável célula formatada como data no Excel — corrija para o número (ex: 2.5) e reimporte.`
                )
            }
        }
    }
}

// Recalcula o total da temporada a partir dos registros jogo a jogo. É
// idempotente (reimportar o mesmo jogo não duplica) e trata fg_mais_longo como
// recorde (máximo), não soma.
function consolidarEstatisticas(registros: { estatisticas: any }[]) {
    const consolidado = {
        passe: { passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0, td_passados: 0, interceptacoes_sofridas: 0, sacks_sofridos: 0, fumble_de_passador: 0 },
        corrida: { corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0 },
        recepcao: { recepcoes: 0, alvo: 0, jardas_recebidas: 0, tds_recebidos: 0 },
        retorno: { retornos: 0, jardas_retornadas: 0, td_retornados: 0 },
        defesa: { tackles_totais: 0, tackles_for_loss: 0, sacks_forcado: 0, fumble_forcado: 0, interceptacao_forcada: 0, passe_desviado: 0, safety: 0, td_defensivo: 0 },
        kicker: { xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0, tentativas_de_fg: 0, fg_mais_longo: 0 },
        punter: { punts: 0, jardas_de_punt: 0 }
    } as any

    for (const registro of registros) {
        const e = registro.estatisticas as any
        for (const cat of Object.keys(consolidado)) {
            for (const campo of Object.keys(consolidado[cat])) {
                const valor = Number(e?.[cat]?.[campo] || 0)
                if (campo === 'fg_mais_longo') {
                    consolidado[cat][campo] = Math.max(consolidado[cat][campo], valor)
                } else {
                    consolidado[cat][campo] += valor
                }
            }
        }
    }

    return consolidado
}

adminRouter.get('/transferencias-json', (req: Request, res: Response) => {
    try {
        const temporadaOrigem = req.query.temporadaOrigem as string;
        const temporadaDestino = req.query.temporadaDestino as string;

        if (!temporadaOrigem || !temporadaDestino) {
            res.status(400).json({
                error: 'Parâmetros temporadaOrigem e temporadaDestino são obrigatórios'
            });
            return;
        }

        const filePath = path.join(process.cwd(), 'public', 'data',
            `transferencias_${temporadaOrigem}_${temporadaDestino}.json`);

        console.log(`Buscando arquivo de transferências: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.log(`Arquivo de transferências não encontrado: ${filePath}`);
            res.status(404).json({
                error: `Não foram encontradas transferências de ${temporadaOrigem} para ${temporadaDestino}`
            });
            return;
        }

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');

            try {
                const transferencias = JSON.parse(fileContent);
                res.status(200).json(transferencias);
            } catch (parseError) {
                console.error('Erro ao fazer parse do JSON:', parseError);
                res.status(500).json({ error: 'Arquivo de transferências está corrompido' });
            }
        } catch (readError) {
            console.error('Erro ao ler arquivo:', readError);
            res.status(500).json({ error: 'Erro ao ler arquivo de transferências' });
        }
    } catch (error) {
        console.error('Erro geral ao buscar transferências:', error);
        res.status(500).json({ error: 'Erro ao buscar transferências' });
    }
});

adminRouter.post('/importar-times', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            console.log('Nenhum arquivo enviado');
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const timeSheet = workbook.Sheets[sheetName];

        const timesRaw = xlsx.utils.sheet_to_json(timeSheet) as any[];

        const times = timesRaw.map(time => ({
            ...time,
            temporada: time.temporada ? String(Math.round(Number(time.temporada))) : String(req.body.temporada || '2026'),
            divisao: time.divisao ? String(time.divisao).toUpperCase().trim() : 'D1'
        }))
            // Filtra apenas D1 e D2 — ignora FEM e outras divisões não suportadas
            .filter(time => time.divisao === 'D1' || time.divisao === 'D2')

        console.log(`📋 Total de times a processar (D1+D2): ${times.length}`)

        const resultados = {
            sucesso: 0,
            atualizados: 0,
            erros: [] as any[]
        };

        for (const time of times) {
            try {
                console.log(`Processando time: ${time.nome}, temporada: ${time.temporada}, divisao: ${time.divisao}`);

                if (!time.nome || !time.sigla || !time.cor) {
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes (nome, sigla ou cor)'
                    });
                    continue;
                }

                const titulosRaw = time['títulos'] ?? time.titulos
                let titulosParsed: any = []
                if (titulosRaw) {
                    if (typeof titulosRaw === 'string') {
                        try { titulosParsed = JSON.parse(titulosRaw) } catch { titulosParsed = [] }
                    } else {
                        titulosParsed = titulosRaw
                    }
                }

                const dadosTime = {
                    sigla: String(time.sigla).trim(),
                    cor: time.cor,
                    cidade: time.cidade || '',
                    bandeira_estado: time.bandeira_estado || '',
                    fundacao: time.fundacao ? String(time.fundacao) : '',
                    logo: time.logo || '',
                    capacete: time.capacete || '',
                    instagram: time.instagram || '',
                    instagram2: time.instagram2 || '',
                    estadio: time.estadio || '',
                    presidente: time.presidente || '',
                    head_coach: time.head_coach || '',
                    instagram_coach: time.instagram_coach || '',
                    coord_ofen: time.coord_ofen || '',
                    coord_defen: time.coord_defen || '',
                    titulos: titulosParsed,
                }

                const timeExistente = await prisma.time.findFirst({
                    where: {
                        nome: time.nome,
                        temporada: String(time.temporada),
                        divisao: time.divisao
                    }
                });

                if (timeExistente) {
                    await prisma.time.update({
                        where: { id: timeExistente.id },
                        data: dadosTime
                    });
                    resultados.atualizados++;
                    console.log(`✏️  Atualizado: ${time.nome} (${time.divisao})`)
                } else {
                    await prisma.time.create({
                        data: {
                            ...dadosTime,
                            nome: time.nome,
                            temporada: String(time.temporada),
                            divisao: time.divisao
                        }
                    });
                    resultados.sucesso++;
                    console.log(`✅ Criado: ${time.nome} (${time.divisao})`)
                }
            } catch (error) {
                console.error(`Erro ao processar time ${time.nome}:`, error);
                resultados.erros.push({
                    time: time.nome || 'Desconhecido',
                    divisao: time.divisao,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        console.log(`\n📊 Importação concluída: ${resultados.sucesso} criados, ${resultados.atualizados} atualizados, ${resultados.erros.length} erros`)

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times criados, ${resultados.atualizados} atualizados`,
            sucesso: resultados.sucesso,
            atualizados: resultados.atualizados,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);
        res.status(500).json({
            error: 'Erro ao processar a planilha de times',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.post('/importar-jogadores', upload.single('arquivo'), async (req: Request, res: Response) => {
    try {
        console.log('📋 Iniciando importação de jogadores...')

        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo foi enviado' })
            return
        }

        const temporada = String(req.body.temporada || '2026').trim()
        // Divisão é opcional (retrocompatível): quando informada, os times são resolvidos só dentro dela
        const divisaoImport = req.body.divisao ? String(req.body.divisao).trim().toUpperCase() : undefined

        console.log(`📁 Arquivo recebido: ${req.file.originalname} (${req.file.size} bytes)`)

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
        const planilha = workbook.Sheets[workbook.SheetNames[0]]
        const dadosJogadores = xlsx.utils.sheet_to_json(planilha)

        console.log(`📊 Total de linhas na planilha: ${dadosJogadores.length}`)

        const resultados = {
            totalLinhas: dadosJogadores.length,
            jogadoresImportados: 0,
            jogadoresAtualizados: 0,
            errosValidacao: 0,
            errosTime: 0,
            errosGerais: 0,
            detalhesErros: [] as Array<{
                linha: number,
                nome?: string,
                time?: string,
                erro: string
            }>
        }

        let linhaAtual = 0

        for (const jogador of dadosJogadores as any[]) {
            linhaAtual++

            try {
                if (!jogador.nome || !jogador.time_nome) {
                    resultados.errosValidacao++
                    resultados.detalhesErros.push({
                        linha: linhaAtual,
                        nome: jogador.nome,
                        time: jogador.time_nome,
                        erro: 'Nome do jogador ou time não informado'
                    })
                    continue
                }

                console.log(`📝 Processando ${linhaAtual}/${dadosJogadores.length}: ${jogador.nome} (${jogador.time_nome})`)

                const time = await prisma.time.findFirst({
                    where: {
                        nome: jogador.time_nome,
                        temporada: temporada,
                        ...(divisaoImport ? { divisao: divisaoImport } : {})
                    }
                })

                if (!time) {
                    resultados.errosTime++
                    resultados.detalhesErros.push({
                        linha: linhaAtual,
                        nome: jogador.nome,
                        time: jogador.time_nome,
                        erro: `Time "${jogador.time_nome}" não encontrado na temporada ${temporada}`
                    })
                    continue
                }

                // Gera o nome do arquivo da camisa automaticamente a partir do
                // slug do time e do número do jogador
                // Ex: time="Tubarões do Cerrado", numero=7 → "camisa-tubaroes-do-cerrado-7.png"
                const numero = Number(jogador.numero || 0)
                const slugTime = gerarSlug(time.nome)
                const camisa = numero > 0 ? `camisa-${slugTime}-${numero}.png` : ''

                const dadosPessoais = {
                    posicao: jogador.posicao || '',
                    setor: jogador.setor || 'Ataque',
                    experiencia: Number(jogador.experiencia || 0),
                    idade: Number(jogador.idade || 0),
                    altura: parseFloat(String(jogador.altura || '0').replace(',', '.')),
                    peso: Number(jogador.peso || 0),
                    instagram: jogador.instagram || '',
                    instagram2: jogador.instagram2 || '',
                    cidade: jogador.cidade || '',
                    nacionalidade: jogador.nacionalidade || '',
                    timeFormador: jogador.time_formador || ''
                }

                // Verifica se jogador já existe neste time/temporada
                const jogadorExistente = await prisma.jogador.findFirst({
                    where: {
                        nome: jogador.nome,
                        times: {
                            some: {
                                timeId: time.id,
                                temporada: temporada
                            }
                        }
                    }
                })

                if (jogadorExistente) {
                    // UPSERT — atualiza dados pessoais e vínculo, preserva estatísticas
                    await prisma.jogador.update({
                        where: { id: jogadorExistente.id },
                        data: dadosPessoais
                    })

                    const vinculo = await prisma.jogadorTime.findFirst({
                        where: {
                            jogadorId: jogadorExistente.id,
                            timeId: time.id,
                            temporada
                        }
                    })

                    if (vinculo) {
                        await prisma.jogadorTime.update({
                            where: { id: vinculo.id },
                            data: {
                                numero,
                                camisa,
                                // estatisticas NÃO são tocadas — gerenciadas pelo handler de estatísticas
                            }
                        })
                    }

                    resultados.jogadoresAtualizados++
                    console.log(`✏️  Atualizado: ${jogador.nome} — camisa: ${camisa || 'sem número'}`)
                    continue
                }

                // NOVO JOGADOR — cria com estatísticas zeradas
                const estatisticasZeradas = {
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

                const novoJogador = await prisma.jogador.create({
                    data: {
                        nome: jogador.nome,
                        ...dadosPessoais
                    }
                })

                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: novoJogador.id,
                        timeId: time.id,
                        temporada,
                        numero,
                        camisa,
                        estatisticas: estatisticasZeradas
                    }
                })

                resultados.jogadoresImportados++
                console.log(`✅ Criado: ${jogador.nome} — camisa: ${camisa || 'sem número'}`)

                if ((resultados.jogadoresImportados + resultados.jogadoresAtualizados) % 50 === 0) {
                    console.log(`📈 Progresso: ${resultados.jogadoresImportados} criados, ${resultados.jogadoresAtualizados} atualizados...`)
                }

            } catch (error) {
                resultados.errosGerais++
                resultados.detalhesErros.push({
                    linha: linhaAtual,
                    nome: jogador.nome,
                    time: jogador.time_nome,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                })
                console.error(`❌ Erro na linha ${linhaAtual}:`, error)
            }
        }

        const totalProcessados = resultados.jogadoresImportados + resultados.jogadoresAtualizados
        const taxaSucesso = resultados.totalLinhas > 0
            ? ((totalProcessados / resultados.totalLinhas) * 100).toFixed(1)
            : '0.0'

        console.log('\n' + '='.repeat(60))
        console.log('📊 RELATÓRIO FINAL DA IMPORTAÇÃO DE JOGADORES')
        console.log('='.repeat(60))
        console.log(`📋 Total de linhas processadas : ${resultados.totalLinhas}`)
        console.log(`✅ Jogadores criados            : ${resultados.jogadoresImportados}`)
        console.log(`✏️  Jogadores atualizados        : ${resultados.jogadoresAtualizados}`)
        console.log(`❌ Erros de validação           : ${resultados.errosValidacao}`)
        console.log(`❌ Erros de time não encontrado : ${resultados.errosTime}`)
        console.log(`❌ Erros gerais                 : ${resultados.errosGerais}`)
        console.log(`📈 Taxa de sucesso              : ${taxaSucesso}%`)
        console.log('='.repeat(60))

        if (resultados.detalhesErros.length > 0) {
            console.log('\n🔍 PRIMEIROS 10 ERROS DETALHADOS:')
            resultados.detalhesErros.slice(0, 10).forEach((erro, index) => {
                console.log(`${index + 1}. Linha ${erro.linha}: ${erro.nome || 'N/A'} (${erro.time || 'N/A'}) — ${erro.erro}`)
            })
            if (resultados.detalhesErros.length > 10) {
                console.log(`... e mais ${resultados.detalhesErros.length - 10} erros`)
            }
        }

        const totalJogadoresNoBanco = await prisma.jogadorTime.count({
            where: { temporada }
        })
        console.log(`\n🎯 VERIFICAÇÃO: ${totalJogadoresNoBanco} jogadores no banco para temporada ${temporada}`)

        res.status(200).json({
            message: 'Importação de jogadores concluída',
            arquivo: req.file.originalname,
            resultados: {
                totalLinhas: resultados.totalLinhas,
                jogadoresCriados: resultados.jogadoresImportados,
                jogadoresAtualizados: resultados.jogadoresAtualizados,
                errosValidacao: resultados.errosValidacao,
                errosTime: resultados.errosTime,
                errosGerais: resultados.errosGerais,
                taxaSucesso: `${taxaSucesso}%`,
                totalJogadoresNoBanco
            },
            erros: resultados.detalhesErros.length > 0 ? resultados.detalhesErros.slice(0, 20) : null
        })

    } catch (error) {
        console.error('❌ Erro crítico na importação de jogadores:', error)
        res.status(500).json({
            error: 'Erro crítico ao processar a planilha de jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.post('/importar-agenda-jogos', upload.single('arquivo'), async (req: Request, res: Response) => {
    try {
        console.log('📋 Iniciando importação de agenda de jogos...')

        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo foi enviado' })
            return
        }

        const temporada = String(req.body.temporada || '').trim()
        if (!temporada) {
            res.status(400).json({ error: 'Temporada não informada. Envie o campo "temporada" no formulário.' })
            return
        }

        // Recebe a divisão — padrão D1 para manter compatibilidade retroativa
        const divisao = String(req.body.divisao || 'D1').trim().toUpperCase()

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true, divisao }
        })

        if (!superliga) {
            res.status(400).json({ error: `Crie a Superliga ${divisao} ${temporada} antes de importar a agenda` })
            return
        }

        console.log(`✅ Superliga encontrada: ID ${superliga.id} (temporada ${temporada}, divisão ${divisao})`)

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jogosRaw = xlsx.utils.sheet_to_json(worksheet) as any[]

        console.log(`📊 Total de jogos na planilha: ${jogosRaw.length}`)

        if (jogosRaw.length === 0) {
            res.status(400).json({ error: 'A planilha está vazia ou não contém dados válidos' })
            return
        }

        // Filtra apenas os times da divisão correta
        const times = await prisma.time.findMany({
            where: { temporada, divisao },
            select: { id: true, nome: true, sigla: true }
        })

        console.log(`📋 Times ${divisao} encontrados no banco: ${times.length}`)

        const mapaTimes = new Map<string, { id: number; nome: string; sigla: string }>()
        times.forEach(time => mapaTimes.set(time.nome.toLowerCase().trim(), time))

        // Helpers ----------------------------------------------------------
        const normalizarConferencia = (v: any): string | null => {
            if (v === undefined || v === null || String(v).trim() === '') return null
            return String(v).trim().toUpperCase().replace(/-/g, ' ')
        }
        const parseDataJogo = (v: any): Date => {
            if (v instanceof Date) return v
            if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000)
            return new Date(v)
        }
        const FASE_RANK: Record<string, number> = {
            'WILD CARD': 1,
            'SEMIFINAL DE CONFERÊNCIA': 2,
            'FINAL DE CONFERÊNCIA': 3,
            'SEMIFINAL NACIONAL': 4,
            'FINAL NACIONAL': 5
        }

        type LinhaJogo = {
            linha: number
            data: Date
            fase: string
            isPlayoff: boolean
            mandante: string
            visitante: string
            conferencia: string | null
            regional: string | null
            observacoes: string | null
            rodadaPlanilha: number | null
        }

        const linhas: LinhaJogo[] = []
        const erros: Array<{ linha: number; erro: string }> = []

        // 1ª passada: parse + validação de data
        for (let i = 0; i < jogosRaw.length; i++) {
            const j = jogosRaw[i] as any
            const linha = i + 1

            const data = parseDataJogo(j.data_jogo)
            if (isNaN(data.getTime())) {
                erros.push({ linha, erro: `Data inválida: "${j.data_jogo}"` })
                continue
            }

            const fase = String(j.fase || 'TEMPORADA REGULAR').trim()
            const isPlayoff = fase.toUpperCase() !== 'TEMPORADA REGULAR'
            const rodadaTxt = j.rodada !== undefined && j.rodada !== null ? String(j.rodada).trim() : ''

            linhas.push({
                linha,
                data,
                fase,
                isPlayoff,
                mandante: String(j.time_mandante ?? '').trim(),
                visitante: String(j.time_visitante ?? '').trim(),
                conferencia: normalizarConferencia(j.conferencia),
                regional: j.regional ? String(j.regional).trim() : null,
                observacoes: j.observacoes ? String(j.observacoes).trim() : null,
                rodadaPlanilha: rodadaTxt !== '' && !isNaN(parseInt(rodadaTxt)) ? parseInt(rodadaTxt) : null
            })
        }

        const datasRegulares = Array.from(
            new Set(linhas.filter(l => !l.isPlayoff).map(l => l.data.getTime()))
        ).sort((a, b) => a - b)
        const mapaRodadaRegular = new Map<number, number>()
        datasRegulares.forEach((t, idx) => mapaRodadaRegular.set(t, idx + 1))

        const resultados = {
            jogosImportados: 0,
            jogosPlayoffs: 0,
            erros,
            warnings: [] as Array<{ linha: number; warning: string }>
        }

        console.log('🚀 Iniciando processamento dos jogos...')

        // 2ª passada: gravação
        for (const l of linhas) {
            try {
                const rodada = l.rodadaPlanilha ?? (
                    l.isPlayoff
                        ? (FASE_RANK[l.fase.toUpperCase()] ?? 99)
                        : (mapaRodadaRegular.get(l.data.getTime()) ?? 1)
                )

                if (l.isPlayoff) {
                    await prisma.jogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            timeCasaId: null,
                            timeVisitanteId: null,
                            dataJogo: l.data,
                            local: 'A definir',
                            rodada,
                            fase: l.fase,
                            status: 'AGENDADO',
                            observacoes: l.observacoes
                                || (l.mandante && l.visitante ? `${l.mandante} x ${l.visitante}` : 'Aguardando definição dos times'),
                            conferencia: l.conferencia,
                            regional: l.regional,
                            temporada
                        }
                    })

                    resultados.jogosPlayoffs++
                    resultados.warnings.push({
                        linha: l.linha,
                        warning: `Jogo de playoff (${l.fase}) criado sem times definidos`
                    })
                    console.log(`🏆 Playoff (${l.fase}): ${l.mandante || '?'} x ${l.visitante || '?'}`)

                } else {
                    const timeCasa = mapaTimes.get(l.mandante.toLowerCase())
                    const timeVisitante = mapaTimes.get(l.visitante.toLowerCase())

                    if (!timeCasa) {
                        resultados.erros.push({ linha: l.linha, erro: `Time mandante não encontrado: "${l.mandante}"` })
                        continue
                    }
                    if (!timeVisitante) {
                        resultados.erros.push({ linha: l.linha, erro: `Time visitante não encontrado: "${l.visitante}"` })
                        continue
                    }

                    await prisma.jogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            timeCasaId: timeCasa.id,
                            timeVisitanteId: timeVisitante.id,
                            dataJogo: l.data,
                            local: timeCasa.nome,
                            rodada,
                            fase: l.fase,
                            status: 'AGENDADO',
                            observacoes: l.observacoes,
                            conferencia: l.conferencia,
                            regional: l.regional,
                            temporada
                        }
                    })

                    resultados.jogosImportados++
                    console.log(`✅ Temporada regular: ${timeCasa.sigla} vs ${timeVisitante.sigla} (rodada ${rodada})`)
                }
            } catch (error) {
                resultados.erros.push({
                    linha: l.linha,
                    erro: `Erro interno: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
                })
                console.error(`❌ Erro na linha ${l.linha}:`, error)
            }
        }

        const resposta = {
            message: `Agenda ${divisao} importada com sucesso!`,
            resumo: {
                jogosTemporadaRegular: resultados.jogosImportados,
                jogosPlayoffs: resultados.jogosPlayoffs,
                totalJogos: resultados.jogosImportados + resultados.jogosPlayoffs,
                jogosComErro: resultados.erros.length,
                totalProcessado: jogosRaw.length
            },
            detalhes: {
                totalLinhas: jogosRaw.length,
                erros: resultados.erros.length > 0 ? resultados.erros : undefined,
                warnings: resultados.warnings.length > 0 ? resultados.warnings : undefined
            },
            proximaEtapa: 'Importe os resultados conforme os jogos forem acontecendo.'
        }

        console.log('✅ Importação da agenda finalizada:')
        console.log(`   📊 Temporada regular: ${resultados.jogosImportados}`)
        console.log(`   🏆 Playoffs: ${resultados.jogosPlayoffs}`)
        console.log(`   ❌ Erros: ${resultados.erros.length}`)

        res.status(200).json(resposta)

    } catch (error) {
        console.error('❌ Erro na importação da agenda:', error)
        res.status(500).json({
            error: 'Erro interno do servidor',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.post('/atualizar-estatisticas', upload.single('arquivo'), async (req, res) => {
    try {
        const id_jogo = req.body.id_jogo;

        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        if (!id_jogo) {
            res.status(400).json({ error: 'ID do jogo é obrigatório' });
            return;
        }

        console.log('📊 INICIANDO IMPORTAÇÃO DE ESTATÍSTICAS...');
        console.log(`🎯 Jogo: ${id_jogo}`);

        const jogo = await prisma.jogo.findUnique({
            where: { id: Number(id_jogo) },
            include: {
                timeCasa: { select: { id: true, nome: true, sigla: true } },
                timeVisitante: { select: { id: true, nome: true, sigla: true } },
                campeonato: { select: { id: true, nome: true, temporada: true } }
            }
        });

        if (!jogo) {
            res.status(404).json({
                error: 'Jogo não encontrado',
                details: { id_jogo, mensagem: 'Verifique se o ID do jogo está correto' }
            });
            return;
        }

        if (jogo.status !== 'FINALIZADO') {
            res.status(400).json({
                error: 'Só é possível inserir estatísticas em jogos finalizados',
                details: {
                    id_jogo,
                    confronto: `${jogo.timeCasa?.nome || 'A definir'} x ${jogo.timeVisitante?.nome || 'A definir'}`,
                    data: jogo.dataJogo,
                    statusPermitido: 'FINALIZADO'
                }
            });
            return;
        }

        console.log(`✅ Jogo ${id_jogo} validado`);
        console.log(`   Confronto: ${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`);

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];
        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`📋 Total de linhas na planilha: ${estatisticasJogo.length}`);

        // Temporada vem do jogo — não depende da planilha
        const temporada = jogo.campeonato.temporada;

        let videoUrl: string | null = null;
        let playByPlay: string | null = null;

        if (estatisticasJogo.length > 0) {
            const primeiraLinha = estatisticasJogo[0];
            if (primeiraLinha.video_url && typeof primeiraLinha.video_url === 'string') {
                videoUrl = primeiraLinha.video_url.trim();
                console.log(`🎥 Video URL encontrado: ${videoUrl}`);
            }
            if (primeiraLinha.play_by_play && typeof primeiraLinha.play_by_play === 'string') {
                playByPlay = primeiraLinha.play_by_play.trim();
            }
        }

        // Gera slug do time para montar o nome do arquivo da camisa
        // Ex: "Guarulhos Rhynos" → "guarulhos-rhynos" → "camisa-guarulhos-rhynos-7.png"
        const gerarSlug = (nome: string): string =>
            nome
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-')

        const resultados = {
            sucesso: 0,
            sucessoConsolidado: 0,
            sucessoJogoAJogo: 0,
            jogadoresCriados: 0,
            erros: [] as any[],
            videoUrl,
            playByPlay: playByPlay ? `${playByPlay.substring(0, 50)}...` : null
        };

        for (const stat of estatisticasJogo) {
            try {
                // jogador_id é IGNORADO — busca sempre por nome
                if (!stat.jogador_nome) {
                    resultados.erros.push({
                        linha: JSON.stringify(stat),
                        erro: 'Nome do jogador é obrigatório'
                    });
                    continue;
                }

                const nomeJogador = String(stat.jogador_nome).trim();
                const timeNomeNormalizado = stat.time_nome?.toLowerCase().trim();

                let jogador;
                let jogadorTime;

                // 1. Busca por nome exato (case insensitive)
                jogador = await prisma.jogador.findFirst({
                    where: { nome: { equals: nomeJogador, mode: 'insensitive' } }
                });

                // 2. Fallback: busca por nome parcial
                if (!jogador) {
                    jogador = await prisma.jogador.findFirst({
                        where: { nome: { contains: nomeJogador, mode: 'insensitive' } }
                    });
                }

                // 3. Jogador não existe — cria automaticamente com dados da planilha
                if (!jogador) {
                    console.log(`➕ Criando jogador: "${nomeJogador}" (${stat.time_nome})`);
                    jogador = await prisma.jogador.create({
                        data: {
                            nome: nomeJogador,
                            posicao: stat.posicao || '',
                            setor: stat.setor || 'Ataque',
                            experiencia: 0,
                            idade: 0,
                            altura: 0,
                            peso: 0,
                            instagram: '',
                            instagram2: '',
                            cidade: '',
                            nacionalidade: '',
                            timeFormador: ''
                        }
                    });
                    resultados.jogadoresCriados++;
                }

                // 4. Busca vínculo do jogador com o time na temporada
                const jogadorTimes = await prisma.jogadorTime.findMany({
                    where: { jogadorId: jogador.id, temporada },
                    include: { time: { select: { id: true, nome: true } } }
                });

                if (jogadorTimes.length === 0) {
                    // Busca o time para criar o vínculo
                    const timeObj = await prisma.time.findFirst({
                        where: {
                            nome: { equals: stat.time_nome?.trim(), mode: 'insensitive' },
                            temporada
                        }
                    });

                    if (!timeObj) {
                        throw new Error(`Time "${stat.time_nome}" não encontrado na temporada ${temporada}`);
                    }

                    // Cria vínculo com camisa gerada automaticamente
                    const numero = Number(stat.numero || 0);
                    const slugTime = gerarSlug(timeObj.nome);
                    const camisa = numero > 0 ? `camisa-${slugTime}-${numero}.png` : '';

                    const novoVinculo = await prisma.jogadorTime.create({
                        data: {
                            jogadorId: jogador.id,
                            timeId: timeObj.id,
                            temporada,
                            numero,
                            camisa,
                            estatisticas: {
                                passe: { passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0, td_passados: 0, interceptacoes_sofridas: 0, sacks_sofridos: 0, fumble_de_passador: 0 },
                                corrida: { corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0 },
                                recepcao: { recepcoes: 0, alvo: 0, jardas_recebidas: 0, tds_recebidos: 0 },
                                retorno: { retornos: 0, jardas_retornadas: 0, td_retornados: 0 },
                                defesa: { tackles_totais: 0, tackles_for_loss: 0, sacks_forcado: 0, fumble_forcado: 0, interceptacao_forcada: 0, passe_desviado: 0, safety: 0, td_defensivo: 0 },
                                kicker: { xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0, tentativas_de_fg: 0, fg_mais_longo: 0 },
                                punter: { punts: 0, jardas_de_punt: 0 }
                            }
                        },
                        include: { time: { select: { id: true, nome: true } } }
                    });

                    jogadorTime = novoVinculo;
                    console.log(`🔗 Vínculo criado: ${nomeJogador} → ${timeObj.nome} (camisa: ${camisa || 'sem número'})`);
                } else {
                    // Prefere o time que bate com time_nome da planilha
                    jogadorTime = jogadorTimes.find(jt =>
                        jt.time?.nome.toLowerCase().trim() === timeNomeNormalizado
                    ) || jogadorTimes[0];
                }

                const estatisticas = {
                    passe: {
                        passes_completos: Number(stat.passes_completos || 0),
                        passes_tentados: Number(stat.passes_tentados || 0),
                        jardas_de_passe: Number(stat.jardas_de_passe || 0),
                        td_passados: Number(stat.td_passados || 0),
                        interceptacoes_sofridas: Number(stat.interceptacoes_sofridas || 0),
                        sacks_sofridos: Number(stat.sacks_sofridos || 0),
                        fumble_de_passador: Number(stat.fumble_de_passador || 0)
                    },
                    corrida: {
                        corridas: Number(stat.corridas || 0),
                        jardas_corridas: Number(stat.jardas_corridas || 0),
                        tds_corridos: Number(stat.tds_corridos || 0),
                        fumble_de_corredor: Number(stat.fumble_de_corredor || 0)
                    },
                    recepcao: {
                        recepcoes: Number(stat.recepcoes || 0),
                        alvo: Number(stat.alvo || 0),
                        jardas_recebidas: Number(stat.jardas_recebidas || 0),
                        tds_recebidos: Number(stat.tds_recebidos || 0)
                    },
                    retorno: {
                        retornos: Number(stat.retornos || 0),
                        jardas_retornadas: Number(stat.jardas_retornadas || 0),
                        td_retornados: Number(stat.td_retornados || 0)
                    },
                    defesa: {
                        tackles_totais: Number(stat.tackles_totais || 0),
                        tackles_for_loss: Number(stat.tackles_for_loss || 0),
                        sacks_forcado: Number(stat.sacks_forcado || 0),
                        fumble_forcado: Number(stat.fumble_forcado || 0),
                        interceptacao_forcada: Number(stat.interceptacao_forcada || 0),
                        passe_desviado: Number(stat.passe_desviado || 0),
                        safety: Number(stat.safety || 0),
                        td_defensivo: Number(stat.td_defensivo || 0)
                    },
                    kicker: {
                        xp_bons: Number(stat.xp_bons || 0),
                        tentativas_de_xp: Number(stat.tentativas_de_xp || 0),
                        fg_bons: Number(stat.fg_bons || 0),
                        tentativas_de_fg: Number(stat.tentativas_de_fg || 0),
                        fg_mais_longo: Number(stat.fg_mais_longo || 0)
                    },
                    punter: {
                        punts: Number(stat.punts || 0),
                        jardas_de_punt: Number(stat.jardas_de_punt || 0)
                    }
                };

                validarEstatisticasJogo(estatisticas, nomeJogador);

                // Upsert na EstatisticaJogo
                const estatisticaExistente = await prisma.estatisticaJogo.findFirst({
                    where: {
                        jogoId: jogo.id,
                        jogadorId: jogador.id
                    }
                });

                if (estatisticaExistente) {
                    await prisma.estatisticaJogo.update({
                        where: { id: estatisticaExistente.id },
                        data: {
                            estatisticas,
                            timeId: jogadorTime.timeId,
                            temporada,
                            rodada: jogo.rodada,
                            fase: jogo.fase
                        }
                    });
                } else {
                    await prisma.estatisticaJogo.create({
                        data: {
                            jogoId: jogo.id,
                            jogadorId: jogador.id,
                            timeId: jogadorTime.timeId,
                            temporada,
                            campeonatoId: jogo.campeonato.id,
                            rodada: jogo.rodada,
                            fase: jogo.fase,
                            estatisticas
                        }
                    });
                }

                resultados.sucessoJogoAJogo++;

                // Atualiza estatísticas consolidadas na temporada
                const todasEstatisticasJogador = await prisma.estatisticaJogo.findMany({
                    where: { jogadorId: jogador.id, temporada, timeId: jogadorTime.timeId }
                });

                const consolidado = consolidarEstatisticas(todasEstatisticasJogador);

                await prisma.jogadorTime.update({
                    where: { id: jogadorTime.id },
                    data: { estatisticas: consolidado }
                });

                resultados.sucessoConsolidado++;
                resultados.sucesso++;

                console.log(`✅ ${nomeJogador} (${jogadorTime.time?.nome || stat.time_nome}) — estatísticas salvas`);

            } catch (error) {
                resultados.erros.push({
                    jogador: stat.jogador_nome || 'N/A',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
                console.error(`❌ Erro ao processar ${stat.jogador_nome}:`, error);
            }
        }

        // Marca o jogo como processado sempre que alguma estatística foi salva
        // e atualiza vídeo/play-by-play só se vieram na planilha
        if (resultados.sucesso > 0 || videoUrl || playByPlay) {
            await prisma.jogo.update({
                where: { id: jogo.id },
                data: {
                    ...(videoUrl && { videoUrl }),
                    ...(playByPlay && { playByPlay }),
                    ...(resultados.sucesso > 0 && { estatisticasProcessadas: true })
                }
            });
            if (videoUrl || playByPlay) {
                console.log(`🎥 Jogo ${id_jogo} atualizado com vídeo e play-by-play`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 RELATÓRIO FINAL');
        console.log('='.repeat(60));
        console.log(`✅ Estatísticas salvas   : ${resultados.sucesso}`);
        console.log(`➕ Jogadores criados     : ${resultados.jogadoresCriados}`);
        console.log(`❌ Erros                 : ${resultados.erros.length}`);
        console.log('='.repeat(60));

        res.status(200).json({
            message: 'Estatísticas importadas com sucesso!',
            resumo: {
                totalLinhas: estatisticasJogo.length,
                sucesso: resultados.sucesso,
                jogadoresCriados: resultados.jogadoresCriados,
                erros: resultados.erros.length
            },
            erros: resultados.erros.length > 0 ? resultados.erros : null,
            jogoId: id_jogo
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar estatísticas:', error);
        res.status(500).json({
            error: 'Erro ao processar estatísticas',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
})

adminRouter.post('/atualizar-estatisticas-lote', upload.array('arquivos', 20), async (req, res) => {
    try {
        console.log('📦 Iniciando importação em LOTE de estatísticas...');

        const arquivos = req.files as Express.Multer.File[];

        if (!arquivos || arquivos.length === 0) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        if (arquivos.length > 20) {
            res.status(400).json({ error: 'Máximo de 20 arquivos por vez' });
            return;
        }

        console.log(`📊 Total de arquivos recebidos: ${arquivos.length}`);

        const resultadoGeral = {
            totalArquivos: arquivos.length,
            sucessos: 0,
            erros: 0,
            detalhes: [] as any[]
        };

        for (let i = 0; i < arquivos.length; i++) {
            const arquivo = arquivos[i];
            const numeroArquivo = i + 1;

            console.log(`\n${'='.repeat(60)}`);
            console.log(`📄 Processando arquivo ${numeroArquivo}/${arquivos.length}: ${arquivo.originalname}`);
            console.log(`${'='.repeat(60)}`);

            try {
                const workbook = xlsx.read(arquivo.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const statsSheet = workbook.Sheets[sheetName];
                const dadosJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

                if (dadosJogo.length === 0) {
                    throw new Error('Planilha vazia');
                }

                const primeiraLinha = dadosJogo[0];
                const jogoId = primeiraLinha.jogo_id || primeiraLinha.id_jogo;

                if (!jogoId) {
                    throw new Error('jogo_id não encontrado na planilha');
                }

                console.log(`🎯 Jogo ID: ${jogoId}`);

                const jogo = await prisma.jogo.findUnique({
                    where: { id: Number(jogoId) },
                    include: {
                        timeCasa: { select: { nome: true, sigla: true } },
                        timeVisitante: { select: { nome: true, sigla: true } }
                    }
                });

                if (!jogo) {
                    throw new Error(`Jogo ${jogoId} não encontrado no banco`);
                }

                if (jogo.status !== 'FINALIZADO') {
                    throw new Error(`Jogo ${jogoId} não está finalizado (status: ${jogo.status})`);
                }

                console.log(`✅ Jogo encontrado: ${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`);

                let videoUrl: string | null = null;
                let playByPlay: string | null = null;

                if (primeiraLinha.video_url && typeof primeiraLinha.video_url === 'string') {
                    videoUrl = primeiraLinha.video_url.trim();
                    console.log(`🎥 Video URL: ${videoUrl}`);
                }

                if (primeiraLinha.play_by_play && typeof primeiraLinha.play_by_play === 'string') {
                    playByPlay = primeiraLinha.play_by_play.trim();
                }

                const resultadoArquivo = {
                    sucesso: 0,
                    erros: [] as any[]
                };

                for (const stat of dadosJogo) {
                    try {
                        if (!stat.jogador_id && !stat.jogador_nome) {
                            continue;
                        }

                        const temporada = String(stat.temporada || '2026');

                        let jogador;
                        let jogadorTime;

                        if (stat.jogador_id) {
                            const jogadorId = Number(stat.jogador_id);

                            jogador = await prisma.jogador.findUnique({
                                where: { id: jogadorId }
                            });

                            if (!jogador) {
                                throw new Error(`Jogador ID ${jogadorId} não encontrado`);
                            }

                            const jogadorTimes = await prisma.jogadorTime.findMany({
                                where: {
                                    jogadorId: jogadorId,
                                    temporada: temporada
                                },
                                include: {
                                    time: { select: { id: true, nome: true } }
                                }
                            });

                            if (jogadorTimes.length === 0) {
                                throw new Error(`Jogador ${jogador.nome} não vinculado na temporada ${temporada}`);
                            }

                            const timeNomeNormalizado = stat.time_nome?.toLowerCase().trim();
                            jogadorTime = jogadorTimes.find(jt =>
                                jt.time?.nome.toLowerCase().trim() === timeNomeNormalizado
                            ) || jogadorTimes[0];

                        } else {
                            if (!stat.time_nome) {
                                throw new Error(`Time do jogador "${stat.jogador_nome}" não informado na planilha`);
                            }

                            // Busca o jogador+vínculo por nome+time; cria automaticamente se não existir
                            // (fluxo 2026 — jogadores se inscrevem ao longo da temporada, sem cadastro prévio)
                            const resultado = await obterOuCriarJogadorTime({
                                prisma,
                                nomeJogador: String(stat.jogador_nome).trim(),
                                nomeTime: String(stat.time_nome).trim(),
                                temporada,
                                numero: stat.numero ? Number(stat.numero) : undefined,
                                posicao: stat.posicao ? String(stat.posicao).trim() : undefined,
                                setor: stat.setor ? String(stat.setor).trim() : undefined
                            });

                            jogador = resultado.jogador;
                            jogadorTime = resultado.jogadorTime;
                        }

                        const estatisticas = {
                            passe: {
                                passes_completos: Number(stat.passes_completos || 0),
                                passes_tentados: Number(stat.passes_tentados || 0),
                                jardas_de_passe: Number(stat.jardas_de_passe || 0),
                                td_passados: Number(stat.td_passados || 0),
                                interceptacoes_sofridas: Number(stat.interceptacoes_sofridas || 0),
                                sacks_sofridos: Number(stat.sacks_sofridos || 0),
                                fumble_de_passador: Number(stat.fumble_de_passador || 0)
                            },
                            corrida: {
                                corridas: Number(stat.corridas || 0),
                                jardas_corridas: Number(stat.jardas_corridas || 0),
                                tds_corridos: Number(stat.tds_corridos || 0),
                                fumble_de_corredor: Number(stat.fumble_de_corredor || 0)
                            },
                            recepcao: {
                                recepcoes: Number(stat.recepcoes || 0),
                                alvo: Number(stat.alvo || 0),
                                jardas_recebidas: Number(stat.jardas_recebidas || 0),
                                tds_recebidos: Number(stat.tds_recebidos || 0)
                            },
                            retorno: {
                                retornos: Number(stat.retornos || 0),
                                jardas_retornadas: Number(stat.jardas_retornadas || 0),
                                td_retornados: Number(stat.td_retornados || 0)
                            },
                            defesa: {
                                tackles_totais: Number(stat.tackles_totais || 0),
                                tackles_for_loss: Number(stat.tackles_for_loss || 0),
                                sacks_forcado: Number(stat.sacks_forcado || 0),
                                fumble_forcado: Number(stat.fumble_forcado || 0),
                                interceptacao_forcada: Number(stat.interceptacao_forcada || 0),
                                passe_desviado: Number(stat.passe_desviado || 0),
                                safety: Number(stat.safety || 0),
                                td_defensivo: Number(stat.td_defensivo || 0)
                            },
                            kicker: {
                                xp_bons: Number(stat.xp_bons || 0),
                                tentativas_de_xp: Number(stat.tentativas_de_xp || 0),
                                fg_bons: Number(stat.fg_bons || 0),
                                tentativas_de_fg: Number(stat.tentativas_de_fg || 0),
                                fg_mais_longo: Number(stat.fg_mais_longo || 0)
                            },
                            punter: {
                                punts: Number(stat.punts || 0),
                                jardas_de_punt: Number(stat.jardas_de_punt || 0)
                            }
                        };

                        validarEstatisticasJogo(estatisticas, jogador.nome);

                        await prisma.estatisticaJogo.upsert({
                            where: {
                                jogoId_jogadorId: {
                                    jogoId: Number(jogoId),
                                    jogadorId: jogador.id
                                }
                            },
                            create: {
                                jogoId: Number(jogoId),
                                jogadorId: jogador.id,
                                timeId: jogadorTime.timeId,
                                campeonatoId: jogo.campeonatoId,
                                temporada: temporada,
                                rodada: jogo.rodada,
                                fase: jogo.fase,
                                estatisticas: estatisticas
                            },
                            update: {
                                estatisticas: estatisticas,
                                timeId: jogadorTime.timeId,
                                rodada: jogo.rodada,
                                fase: jogo.fase
                            }
                        });

                        // Recalcula o total a partir dos registros jogo a jogo (idempotente:
                        // reimportar o mesmo jogo não duplica as estatísticas)
                        const todasEstatisticasJogador = await prisma.estatisticaJogo.findMany({
                            where: { jogadorId: jogador.id, temporada: temporada, timeId: jogadorTime.timeId }
                        });

                        await prisma.jogadorTime.update({
                            where: { id: jogadorTime.id },
                            data: { estatisticas: consolidarEstatisticas(todasEstatisticasJogador) }
                        });

                        resultadoArquivo.sucesso++;

                    } catch (error: any) {
                        resultadoArquivo.erros.push({
                            jogador: stat.jogador_nome || `ID ${stat.jogador_id}`,
                            erro: error.message
                        });
                    }
                }

                await prisma.jogo.update({
                    where: { id: Number(jogoId) },
                    data: {
                        ...(videoUrl && { videoUrl }),
                        ...(playByPlay && { playByPlay }),
                        estatisticasProcessadas: true
                    }
                });

                console.log(`✅ Arquivo ${numeroArquivo} processado: ${resultadoArquivo.sucesso} jogadores`);

                resultadoGeral.sucessos++;
                resultadoGeral.detalhes.push({
                    arquivo: arquivo.originalname,
                    jogoId: Number(jogoId),
                    status: 'sucesso',
                    jogadoresProcessados: resultadoArquivo.sucesso,
                    errosJogadores: resultadoArquivo.erros.length,
                    videoUrl: videoUrl ? '✅' : '❌',
                    playByPlay: playByPlay ? '✅' : '❌'
                });

            } catch (error: any) {
                console.error(`❌ Erro no arquivo ${numeroArquivo}:`, error.message);

                resultadoGeral.erros++;
                resultadoGeral.detalhes.push({
                    arquivo: arquivo.originalname,
                    status: 'erro',
                    mensagem: error.message
                });
            }
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 RESUMO DA IMPORTAÇÃO EM LOTE');
        console.log(`${'='.repeat(60)}`);
        console.log(`✅ Sucessos: ${resultadoGeral.sucessos}/${resultadoGeral.totalArquivos}`);
        console.log(`❌ Erros: ${resultadoGeral.erros}/${resultadoGeral.totalArquivos}`);

        res.json({
            success: true,
            mensagem: `Processados ${resultadoGeral.totalArquivos} arquivos: ${resultadoGeral.sucessos} sucessos, ${resultadoGeral.erros} erros`,
            ...resultadoGeral
        });

    } catch (error) {
        console.error('❌ Erro geral na importação em lote:', error);
        res.status(500).json({
            error: 'Erro ao processar importação em lote',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.post('/atualizar-video-playbyplay', upload.single('arquivo'), async (req, res) => {
    try {
        const { id_jogo } = req.body;

        console.log(`🎥 Iniciando atualização de vídeo/play-by-play para jogo ${id_jogo}...`);

        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        if (!id_jogo) {
            res.status(400).json({ error: 'ID do jogo é obrigatório' });
            return;
        }

        const jogoId = parseInt(id_jogo);

        const jogo = await prisma.jogo.findUnique({
            where: { id: jogoId },
            select: {
                id: true,
                status: true,
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        });

        if (!jogo) {
            res.status(404).json({ error: 'Jogo não encontrado' });
            return;
        }

        console.log(`✅ Jogo encontrado: ${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`);

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];
        const dadosJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`📋 Total de linhas na planilha: ${dadosJogo.length}`);

        let videoUrl: string | null = null;
        let playByPlay: string | null = null;

        if (dadosJogo.length > 0) {
            const primeiraLinha = dadosJogo[0];

            if (primeiraLinha.video_url && typeof primeiraLinha.video_url === 'string') {
                videoUrl = primeiraLinha.video_url.trim();
                console.log(`🎥 Video URL encontrado: ${videoUrl}`);
            } else {
                console.log('⚠️ video_url não encontrado ou inválido na planilha');
            }

            if (primeiraLinha.play_by_play && typeof primeiraLinha.play_by_play === 'string') {
                playByPlay = primeiraLinha.play_by_play.trim();
            } else {
                console.log('⚠️ play_by_play não encontrado ou inválido na planilha');
            }
        } else {
            res.status(400).json({ error: 'Planilha vazia ou sem dados' });
            return;
        }

        if (!videoUrl && !playByPlay) {
            res.status(400).json({
                error: 'Nenhum dado encontrado',
                details: 'A planilha deve conter as colunas "video_url" e/ou "play_by_play"'
            });
            return;
        }

        await prisma.jogo.update({
            where: { id: jogoId },
            data: {
                videoUrl: videoUrl,
                playByPlay: playByPlay
            }
        });

        console.log(`✅ Jogo ${jogoId} atualizado com sucesso!`);
        console.log(`   Video URL: ${videoUrl ? '✅ Atualizado' : '❌ Não fornecido'}`);
        console.log(`   Play-by-Play: ${playByPlay ? '✅ Atualizado' : '❌ Não fornecido'}`);

        res.json({
            success: true,
            mensagem: 'Vídeo e Play-by-Play atualizados com sucesso!',
            jogoId: String(jogoId),
            sucesso: 1,
            detalhes: {
                videoUrl: videoUrl ? '✅ Atualizado' : '❌ Não fornecido',
                playByPlay: playByPlay ? `✅ Atualizado (${playByPlay.length} caracteres)` : '❌ Não fornecido',
                playByPlayPreview: playByPlay ? playByPlay.substring(0, 100) + '...' : null
            }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar video/play-by-play:', error);
        res.status(500).json({
            error: 'Erro ao processar atualização',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.post('/atualizar-videos-lote', upload.single('arquivo'), async (req, res) => {
    try {
        console.log('🎥📦 Iniciando atualização em LOTE de vídeos/play-by-play...');

        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];
        const dadosJogos = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`📋 Total de jogos na planilha: ${dadosJogos.length}`);

        if (dadosJogos.length === 0) {
            res.status(400).json({ error: 'Planilha vazia' });
            return;
        }

        const resultadoGeral = {
            totalJogos: dadosJogos.length,
            sucessos: 0,
            erros: 0,
            detalhes: [] as any[]
        };

        for (let i = 0; i < dadosJogos.length; i++) {
            const linha = dadosJogos[i];
            const numeroLinha = i + 1;

            try {
                const jogoId = linha.jogo_id || linha.id_jogo;

                if (!jogoId) {
                    throw new Error(`Linha ${numeroLinha}: jogo_id não encontrado`);
                }

                console.log(`\n🎯 Processando jogo ID: ${jogoId} (linha ${numeroLinha}/${dadosJogos.length})`);

                const jogo = await prisma.jogo.findUnique({
                    where: { id: Number(jogoId) },
                    select: {
                        id: true,
                        status: true,
                        timeCasa: { select: { nome: true, sigla: true } },
                        timeVisitante: { select: { nome: true, sigla: true } }
                    }
                });

                if (!jogo) {
                    throw new Error(`Jogo ${jogoId} não encontrado`);
                }

                console.log(`✅ Jogo encontrado: ${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`);

                let videoUrl: string | null = null;
                let playByPlay: string | null = null;

                if (linha.video_url && typeof linha.video_url === 'string') {
                    videoUrl = linha.video_url.trim();
                    console.log(`   🎥 Video URL: ${videoUrl}`);
                }

                if (linha.play_by_play && typeof linha.play_by_play === 'string') {
                    playByPlay = linha.play_by_play.trim();
                }

                if (!videoUrl && !playByPlay) {
                    throw new Error(`Linha ${numeroLinha}: Nenhum dado encontrado (video_url e play_by_play vazios)`);
                }

                await prisma.jogo.update({
                    where: { id: Number(jogoId) },
                    data: {
                        videoUrl: videoUrl,
                        playByPlay: playByPlay
                    }
                });

                console.log(`✅ Jogo ${jogoId} atualizado com sucesso!`);

                resultadoGeral.sucessos++;
                resultadoGeral.detalhes.push({
                    jogoId: Number(jogoId),
                    linha: numeroLinha,
                    status: 'sucesso',
                    confronto: `${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`,
                    videoUrl: videoUrl ? '✅' : '❌',
                    playByPlay: playByPlay ? '✅' : '❌'
                });

            } catch (error: any) {
                console.error(`❌ Erro na linha ${numeroLinha}:`, error.message);

                resultadoGeral.erros++;
                resultadoGeral.detalhes.push({
                    linha: numeroLinha,
                    jogoId: linha.jogo_id || linha.id_jogo || 'N/A',
                    status: 'erro',
                    mensagem: error.message
                });
            }
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 RESUMO DA ATUALIZAÇÃO EM LOTE');
        console.log(`${'='.repeat(60)}`);
        console.log(`✅ Sucessos: ${resultadoGeral.sucessos}/${resultadoGeral.totalJogos}`);
        console.log(`❌ Erros: ${resultadoGeral.erros}/${resultadoGeral.totalJogos}`);

        res.json({
            success: true,
            mensagem: `Processados ${resultadoGeral.totalJogos} jogos: ${resultadoGeral.sucessos} sucessos, ${resultadoGeral.erros} erros`,
            ...resultadoGeral
        });

    } catch (error) {
        console.error('❌ Erro geral na atualização em lote:', error);
        res.status(500).json({
            error: 'Erro ao processar atualização em lote',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.put('/campeonatos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' })
            return
        }

        const { nome, status, dataInicio, dataFim, descricao } = req.body

        const existente = await prisma.campeonato.findUnique({ where: { id } })
        if (!existente) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        const dados: any = {}

        if (nome !== undefined) {
            if (!String(nome).trim()) {
                res.status(400).json({ error: 'O nome não pode ficar vazio' })
                return
            }
            dados.nome = String(nome).trim()
        }

        if (status !== undefined) {
            if (!String(status).trim()) {
                res.status(400).json({ error: 'O status não pode ficar vazio' })
                return
            }
            dados.status = String(status).trim()
        }

        if (descricao !== undefined) {
            dados.descricao = String(descricao).trim() || null
        }

        if (dataInicio !== undefined && dataInicio !== '') {
            const inicio = new Date(dataInicio)
            if (isNaN(inicio.getTime())) {
                res.status(400).json({ error: 'Data de início inválida' })
                return
            }
            dados.dataInicio = inicio
        }

        if (dataFim !== undefined) {
            if (dataFim === '' || dataFim === null) {
                dados.dataFim = null
            } else {
                const fim = new Date(dataFim)
                if (isNaN(fim.getTime())) {
                    res.status(400).json({ error: 'Data de fim inválida' })
                    return
                }
                dados.dataFim = fim
            }
        }

        if (Object.keys(dados).length === 0) {
            res.status(400).json({ error: 'Nenhum dado fornecido para atualização' })
            return
        }

        const atualizado = await prisma.campeonato.update({ where: { id }, data: dados })
        res.json({ message: 'Configurações salvas com sucesso', campeonato: atualizado })
    } catch (error) {
        console.error('Erro ao atualizar campeonato:', error)
        res.status(500).json({
            error: 'Erro ao atualizar campeonato',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/campeonatos/estatisticas', async (req, res) => {
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2026'

        const [
            totalCampeonatos,
            campeonatosAtivos,
            timesAtivos,
            totalJogos,
            jogosFinalizados
        ] = await Promise.all([
            prisma.campeonato.count({ where: { temporada: temporadaFiltro } }),
            prisma.campeonato.count({
                where: {
                    temporada: temporadaFiltro,
                    status: 'EM_ANDAMENTO'
                }
            }),
            prisma.time.count({ where: { temporada: temporadaFiltro } }),
            prisma.jogo.count(),
            prisma.jogo.count({ where: { status: 'FINALIZADO' } })
        ])

        const stats = {
            totalCampeonatos,
            campeonatosAtivos,
            jogosAgendados: totalJogos - jogosFinalizados,
            jogosFinalizados,
            timesAtivos,
            timesParticipantes: timesAtivos,
            jogosEstaSemana: 0,
            crescimentoCampeonatos: 0,
            novosTimes: 0,
            melhoriaOperacional: 0,
            taxaConclusao: 0,
            campeonatosPorStatus: [],
            jogosPorMes: [],
            evolucaoCampeonatos: [],
            statusJogos: [],
            performancePorTipo: [],
            participacaoRegional: [],
            tendenciaMensal: [],
            atividadesRecentes: [],
            alertas: [],
            topCampeonatos: [],
            topTimes: [],
            topRegioes: [],
            mediaJogosPorCampeonato: 0,
            tempoMedioDuracao: 0,
            taxaAdiamentos: 0,
            mediaGruposPorCampeonato: 0,
            participacaoMedia: 0,
            pontuacaoMedia: 0,

            recentActivities: [],
            alerts: []
        }

        res.status(200).json(stats)
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error)
        res.status(500).json({ error: 'Erro ao buscar estatísticas' })
    }
})

adminRouter.get('/jogos', async (req, res) => {
    try {
        const {
            temporada = '2026',
            divisao = 'D1',
            status,
            fase,
            rodada,
            conferencia,
            limite
        } = req.query

        const where: any = {}

        if (temporada) {
            const campeonato = await prisma.campeonato.findFirst({
                where: {
                    temporada: temporada as string,
                    isSuperliga: true,
                    divisao: String(divisao).toUpperCase()
                }
            })

            if (campeonato) {
                where.campeonatoId = campeonato.id
            } else {
                res.status(404).json({ error: `Superliga ${divisao} ${temporada} não encontrada` })
                return
            }
        }

        if (status) where.status = status as string
        if (fase) where.fase = fase as string
        if (rodada) where.rodada = parseInt(rodada as string)
        if (conferencia) where.conferencia = conferencia as string

        const jogos = await prisma.jogo.findMany({
            where,
            include: {
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                campeonato: {
                    select: {
                        id: true,
                        nome: true,
                        temporada: true
                    }
                }
            },
            orderBy: [
                { dataJogo: 'asc' },
                { rodada: 'asc' }
            ],
            take: limite ? parseInt(limite as string) : undefined
        })

        res.json(jogos)
    } catch (error) {
        console.error('Erro ao buscar jogos:', error)
        res.status(500).json({
            error: 'Erro ao buscar jogos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/jogos/:id', async (req, res) => {
    try {
        const { id } = req.params

        const jogo = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true,
                        presidente: true,
                        head_coach: true,
                        estadio: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true,
                        presidente: true,
                        head_coach: true,
                        estadio: true
                    }
                },
                campeonato: {
                    select: {
                        id: true,
                        nome: true,
                        temporada: true,
                        isSuperliga: true
                    }
                },
                estatisticas: {
                    include: {
                        jogador: {
                            select: {
                                id: true,
                                nome: true,
                                posicao: true
                            }
                        },
                        time: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true
                            }
                        }
                    }
                }
            }
        })

        if (!jogo) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        res.json(jogo)
    } catch (error) {
        console.error('Erro ao buscar jogo:', error)
        res.status(500).json({
            error: 'Erro ao buscar jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.put('/jogos/:id/resultado', async (req, res) => {
    try {
        const { id } = req.params
        const { placarCasa, placarVisitante, status, observacoes } = req.body

        if (placarCasa === undefined || placarVisitante === undefined) {
            res.status(400).json({ error: 'Placares são obrigatórios' })
            return
        }

        if (placarCasa < 0 || placarVisitante < 0) {
            res.status(400).json({ error: 'Placares não podem ser negativos' })
            return
        }

        const jogoExistente = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        })

        if (!jogoExistente) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        let novoStatus = status || 'FINALIZADO'
        if (placarCasa === placarVisitante && (placarCasa > 0 || placarVisitante > 0)) {
            novoStatus = 'FINALIZADO'
        }

        const jogoAtualizado = await prisma.jogo.update({
            where: { id: parseInt(id) },
            data: {
                placarCasa: parseInt(placarCasa),
                placarVisitante: parseInt(placarVisitante),
                status: novoStatus,
                observacoes: observacoes || null
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        })

        console.log(`Resultado atualizado: ${jogoAtualizado.timeCasa?.nome} ${placarCasa} x ${placarVisitante} ${jogoAtualizado.timeVisitante?.nome}`)

        res.json({
            message: 'Resultado atualizado com sucesso',
            jogo: jogoAtualizado
        })
    } catch (error) {
        console.error('Erro ao atualizar resultado:', error)
        res.status(500).json({
            error: 'Erro ao atualizar resultado do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/jogos/stats/:temporada', async (req, res) => {
    try {
        const { temporada } = req.params
        const divisao = String(req.query.divisao || 'D1').toUpperCase()

        const campeonato = await prisma.campeonato.findFirst({
            where: {
                temporada: temporada,
                isSuperliga: true,
                divisao
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
            return
        }

        const totalJogos = await prisma.jogo.count({
            where: { campeonatoId: campeonato.id }
        })

        const jogosPorStatus = await prisma.jogo.groupBy({
            by: ['status'],
            where: { campeonatoId: campeonato.id },
            _count: { status: true }
        })

        const jogosPorFase = await prisma.jogo.groupBy({
            by: ['fase'],
            where: { campeonatoId: campeonato.id },
            _count: { fase: true }
        })

        const jogosPorRodada = await prisma.jogo.groupBy({
            by: ['rodada'],
            where: { campeonatoId: campeonato.id },
            _count: { rodada: true },
            orderBy: { rodada: 'asc' }
        })

        const proximosJogos = await prisma.jogo.findMany({
            where: {
                campeonatoId: campeonato.id,
                status: 'AGENDADO',
                dataJogo: { gte: new Date() }
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'asc' },
            take: 5
        })

        const ultimosResultados = await prisma.jogo.findMany({
            where: {
                campeonatoId: campeonato.id,
                status: 'FINALIZADO'
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'desc' },
            take: 5
        })

        const stats = {
            temporada,
            totalJogos,
            statusBreakdown: jogosPorStatus.reduce((acc, item) => {
                acc[item.status] = item._count.status
                return acc
            }, {} as Record<string, number>),
            faseBreakdown: jogosPorFase.reduce((acc, item) => {
                acc[item.fase] = item._count.fase
                return acc
            }, {} as Record<string, number>),
            rodadaBreakdown: jogosPorRodada.map(item => ({
                rodada: item.rodada,
                jogos: item._count.rodada
            })),
            proximosJogos,
            ultimosResultados
        }

        res.json(stats)
    } catch (error) {
        console.error('Erro ao buscar estatísticas dos jogos:', error)
        res.status(500).json({
            error: 'Erro ao buscar estatísticas',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.post('/importar-resultados-jogos', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' })
            return
        }

        console.log('📋 Iniciando importação de resultados (FLUXO SIMPLIFICADO)...')

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const resultadosSheet = workbook.Sheets[sheetName]
        const resultadosRaw = xlsx.utils.sheet_to_json(resultadosSheet) as any[]

        const temporada = String(req.body.temporada || '2026').trim()
        const divisaoResultados = req.body.divisao ? String(req.body.divisao).trim().toUpperCase() : undefined
        const times = await prisma.time.findMany({
            where: { temporada, ...(divisaoResultados ? { divisao: divisaoResultados } : {}) },
            select: { id: true, nome: true, sigla: true }
        })

        const mapaTimes = new Map<string, { id: number; nome: string; sigla: string }>()
        times.forEach(time => {
            mapaTimes.set(time.nome.toLowerCase().trim(), time)
        })

        const resultados = {
            sucesso: 0,
            erros: [] as any[],
            jogosPulados: 0
        }

        for (const resultado of resultadosRaw) {
            try {
                const jogoId = parseInt(resultado.id_jogo)
                console.log(`🔍 Buscando jogo ID: ${jogoId}`)

                const jogo = await prisma.jogo.findUnique({
                    where: { id: jogoId },
                    include: {
                        timeCasa: true,
                        timeVisitante: true
                    }
                })

                if (jogo) {
                    console.log(`✅ Jogo encontrado: ${jogo.timeCasa?.nome || 'N/A'} vs ${jogo.timeVisitante?.nome || 'N/A'}`)
                    console.log(`   Status atual: ${jogo.status}`)
                    console.log(`   Fase: ${jogo.fase}`)
                } else {
                    console.log(`❌ Jogo ${jogoId} não encontrado`)
                }

                if (!jogo) {
                    resultados.erros.push({
                        linha: jogoId,
                        erro: 'Jogo não encontrado'
                    })
                    continue
                }

                if (jogo.timeCasa?.nome.includes('TBD') || jogo.timeVisitante?.nome.includes('TBD')) {
                    console.log(`⏭️  Pulando jogo ${jogoId} - Times ainda não definidos (TBD)`)
                    resultados.jogosPulados++
                    continue
                }

                const placarCasa = parseInt(resultado.placar_mandante)
                const placarVisitante = parseInt(resultado.placar_visitante)
                const statusPlanilha = resultado.status || 'FINALIZADO'

                if (statusPlanilha === 'FINALIZADO' && (isNaN(placarCasa) || isNaN(placarVisitante))) {
                    resultados.erros.push({
                        linha: jogoId,
                        erro: 'Para jogos finalizados, placares são obrigatórios'
                    })
                    continue
                }

                let timeVencedorId = null
                if (statusPlanilha === 'FINALIZADO' && jogo.fase !== 'TEMPORADA REGULAR') {
                    timeVencedorId = placarCasa > placarVisitante ? jogo.timeCasaId : jogo.timeVisitanteId
                }

                const updateData: any = {
                    status: statusPlanilha,
                    observacoes: resultado.observacoes || null
                }

                if (statusPlanilha === 'FINALIZADO') {
                    updateData.placarCasa = placarCasa
                    updateData.placarVisitante = placarVisitante
                    updateData.local = resultado.local || jogo.local

                    if (!jogo.timeCasaId || !jogo.timeVisitanteId) {
                        const nomeTimeCasa = resultado.time_mandante?.toString()?.trim()
                        const nomeTimeVisitante = resultado.time_visitante?.toString()?.trim()

                        if (nomeTimeCasa && nomeTimeVisitante) {
                            const timeCasa = mapaTimes.get(nomeTimeCasa.toLowerCase())
                            const timeVisitante = mapaTimes.get(nomeTimeVisitante.toLowerCase())

                            if (timeCasa && timeVisitante) {
                                updateData.timeCasaId = timeCasa.id
                                updateData.timeVisitanteId = timeVisitante.id
                                console.log(`🏆 Atualizando times do playoff: ${timeCasa.nome} vs ${timeVisitante.nome}`)
                            }
                        }
                    }

                    if (timeVencedorId) {
                        updateData.timeVencedorId = timeVencedorId
                    }
                }

                await prisma.jogo.update({
                    where: { id: jogoId },
                    data: updateData
                })

                resultados.sucesso++
                console.log(`✅ Jogo ${jogoId} (${jogo.fase}): ${placarCasa} x ${placarVisitante}`)

            } catch (error) {
                resultados.erros.push({
                    linha: resultado.id_jogo,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                })
            }
        }

        res.json({
            message: 'Importação concluída',
            resultados: {
                ...resultados,
                total: resultadosRaw.length
            }
        })

    } catch (error) {
        console.error('Erro na importação:', error)
        res.status(500).json({
            error: 'Erro na importação de resultados',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    } finally {

    }
})

adminRouter.get('/status-superliga/:temporada', async (req: Request, res: Response): Promise<void> => {
    try {
        const { temporada } = req.params
        const divisao = String(req.query.divisao || 'D1').toUpperCase()

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true, divisao },
            include: {
                conferencias: {
                    include: { regionais: true }
                }
            }
        })

        if (!superliga) {
            res.status(404).json({ error: 'Superliga não encontrada' })
            return
        }

        const jogosStats = await prisma.jogo.groupBy({
            by: ['status'],
            where: { campeonatoId: superliga.id },
            _count: { id: true }
        })

        const playoffStats = await prisma.jogo.groupBy({
            by: ['status'],
            where: {
                campeonatoId: superliga.id,
                fase: {
                    not: 'TEMPORADA REGULAR'
                }
            },
            _count: { id: true }
        })

        const proximosJogos = await prisma.jogo.findMany({
            where: {
                campeonatoId: superliga.id,
                status: 'AGENDADO',
                dataJogo: { gte: new Date() }
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'asc' },
            take: 10
        })

        const classificacao = await calcularClassificacaoPorConferencia(superliga.id)

        const config = superliga.configSuperliga as any
        const faseAtual = config?.faseAtual || 'CONFIGURACAO'

        const timesDaTemporada = await prisma.time.count({ where: { temporada } })

        const status = {
            superliga: {
                id: superliga.id,
                nome: superliga.nome,
                temporada: superliga.temporada,
                status: superliga.status,
                fase: faseAtual
            },
            estrutura: {
                conferencias: superliga.conferencias.length,
                regionais: superliga.conferencias.reduce((acc, c) => acc + c.regionais.length, 0),
                times: timesDaTemporada
            },
            jogos: {
                temporadaRegular: jogosStats.reduce((acc, stat) => acc + stat._count.id, 0),
                playoffs: playoffStats.reduce((acc, stat) => acc + stat._count.id, 0),
                porStatus: {
                    agendados: jogosStats.find(s => s.status === 'AGENDADO')?._count.id || 0,
                    finalizados: jogosStats.find(s => s.status === 'FINALIZADO')?._count.id || 0,
                    aoVivo: jogosStats.find(s => s.status === 'AO VIVO')?._count.id || 0
                }
            },
            proximosJogos,
            classificacao,
        }

        res.json(status)
        return

    } catch (error) {
        console.error('Erro ao buscar status:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
        return
    }
})

adminRouter.get('/jogadores/:jogadorId/estatisticas-jogos', async (req: Request, res: Response) => {
    try {
        const { jogadorId } = req.params

        console.log(`📊 Buscando estatísticas de jogos para jogador ${jogadorId}`)

        const temporada = String(req.query.temporada || '2026')

        const jogadorIdNum = parseInt(jogadorId)
        if (isNaN(jogadorIdNum)) {
            res.status(400).json({ error: 'ID do jogador deve ser um número válido' })
            return
        }

        const jogador = await prisma.jogador.findUnique({
            where: { id: jogadorIdNum },
            select: { id: true, nome: true }
        })

        if (!jogador) {
            res.status(404).json({ error: 'Jogador não encontrado' })
            return
        }

        const estatisticasJogos = await prisma.estatisticaJogo.findMany({
            where: {
                jogadorId: jogadorIdNum,
                temporada: temporada
            },
            include: {
                jogo: {
                    include: {
                        timeCasa: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                logo: true,
                                cor: true
                            }
                        },
                        timeVisitante: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                logo: true,
                                cor: true
                            }
                        },
                        campeonato: {
                            select: {
                                id: true,
                                nome: true,
                                temporada: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                jogo: {
                    dataJogo: 'desc'
                }
            }
        })

        console.log(`✅ Encontradas ${estatisticasJogos.length} estatísticas de jogos para o jogador ${jogador.nome}`)

        const estatisticasFormatadas = estatisticasJogos.map(estatistica => ({
            id: estatistica.id,
            jogoId: estatistica.jogoId,
            jogadorId: estatistica.jogadorId,
            timeId: estatistica.timeId,
            estatisticas: estatistica.estatisticas,
            temporada: estatistica.temporada,
            jogo: {
                id: estatistica.jogo.id,
                dataJogo: estatistica.jogo.dataJogo.toISOString(),
                local: estatistica.jogo.local,
                status: estatistica.jogo.status,
                placarCasa: estatistica.jogo.placarCasa,
                placarVisitante: estatistica.jogo.placarVisitante,
                rodada: estatistica.jogo.rodada,
                fase: estatistica.jogo.fase,
                observacoes: estatistica.jogo.observacoes,
                timeCasa: estatistica.jogo.timeCasa,
                timeVisitante: estatistica.jogo.timeVisitante,
                campeonato: estatistica.jogo.campeonato
            }
        }))

        const resumo = {
            totalJogos: estatisticasJogos.length,
            jogosFinalizados: estatisticasJogos.filter(est => est.jogo.status === 'FINALIZADO').length,
            ultimoJogo: estatisticasJogos.length > 0 ? estatisticasJogos[0].jogo.dataJogo : null,
            proximoJogo: estatisticasJogos.find(est => est.jogo.status === 'AGENDADO')?.jogo.dataJogo || null
        }

        res.json({
            jogador: {
                id: jogador.id,
                nome: jogador.nome
            },
            resumo,
            estatisticas: estatisticasFormatadas
        })

    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas de jogos do jogador:', error)
        res.status(500).json({
            error: 'Erro interno do servidor',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.put('/estatistica-jogo/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { estatisticas } = req.body
        const estatisticaId = parseInt(id, 10)

        console.log(`🔍 [PUT] Atualizando estatística de jogo ${estatisticaId}`)

        if (isNaN(estatisticaId)) {
            res.status(400).json({ error: 'ID da estatística inválido' })
            return
        }

        if (!estatisticas) {
            res.status(400).json({ error: 'Estatísticas são obrigatórias' })
            return
        }

        const estatisticaExistente = await prisma.estatisticaJogo.findUnique({
            where: { id: estatisticaId },
            include: {
                jogo: {
                    select: {
                        id: true,
                        dataJogo: true,
                        status: true,
                        timeCasa: { select: { nome: true, sigla: true } },
                        timeVisitante: { select: { nome: true, sigla: true } }
                    }
                },
                jogador: {
                    select: {
                        id: true,
                        nome: true,
                        posicao: true
                    }
                }
            }
        })

        if (!estatisticaExistente) {
            res.status(404).json({ error: 'Estatística de jogo não encontrada' })
            return
        }

        const estatisticasEstruturadas = {
            passe: {
                passes_completos: Number(estatisticas.passe?.passes_completos || 0),
                passes_tentados: Number(estatisticas.passe?.passes_tentados || 0),
                jardas_de_passe: Number(estatisticas.passe?.jardas_de_passe || 0),
                td_passados: Number(estatisticas.passe?.td_passados || 0),
                interceptacoes_sofridas: Number(estatisticas.passe?.interceptacoes_sofridas || 0),
                sacks_sofridos: Number(estatisticas.passe?.sacks_sofridos || 0),
                fumble_de_passador: Number(estatisticas.passe?.fumble_de_passador || 0)
            },
            corrida: {
                corridas: Number(estatisticas.corrida?.corridas || 0),
                jardas_corridas: Number(estatisticas.corrida?.jardas_corridas || 0),
                tds_corridos: Number(estatisticas.corrida?.tds_corridos || 0),
                fumble_de_corredor: Number(estatisticas.corrida?.fumble_de_corredor || 0)
            },
            recepcao: {
                recepcoes: Number(estatisticas.recepcao?.recepcoes || 0),
                alvo: Number(estatisticas.recepcao?.alvo || 0),
                jardas_recebidas: Number(estatisticas.recepcao?.jardas_recebidas || 0),
                tds_recebidos: Number(estatisticas.recepcao?.tds_recebidos || 0)
            },
            retorno: {
                retornos: Number(estatisticas.retorno?.retornos || 0),
                jardas_retornadas: Number(estatisticas.retorno?.jardas_retornadas || 0),
                td_retornados: Number(estatisticas.retorno?.td_retornados || 0)
            },
            defesa: {
                tackles_totais: Number(estatisticas.defesa?.tackles_totais || 0),
                tackles_for_loss: Number(estatisticas.defesa?.tackles_for_loss || 0),
                sacks_forcado: Number(estatisticas.defesa?.sacks_forcado || 0),
                fumble_forcado: Number(estatisticas.defesa?.fumble_forcado || 0),
                interceptacao_forcada: Number(estatisticas.defesa?.interceptacao_forcada || 0),
                passe_desviado: Number(estatisticas.defesa?.passe_desviado || 0),
                safety: Number(estatisticas.defesa?.safety || 0),
                td_defensivo: Number(estatisticas.defesa?.td_defensivo || 0)
            },
            kicker: {
                xp_bons: Number(estatisticas.kicker?.xp_bons || 0),
                tentativas_de_xp: Number(estatisticas.kicker?.tentativas_de_xp || 0),
                fg_bons: Number(estatisticas.kicker?.fg_bons || 0),
                tentativas_de_fg: Number(estatisticas.kicker?.tentativas_de_fg || 0),
                fg_mais_longo: Number(estatisticas.kicker?.fg_mais_longo || 0)
            },
            punter: {
                punts: Number(estatisticas.punter?.punts || 0),
                jardas_de_punt: Number(estatisticas.punter?.jardas_de_punt || 0)
            }
        }

        const estatisticaAtualizada = await prisma.estatisticaJogo.update({
            where: { id: estatisticaId },
            data: {
                estatisticas: estatisticasEstruturadas
            },
            include: {
                jogo: {
                    include: {
                        timeCasa: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                cor: true,
                                logo: true
                            }
                        },
                        timeVisitante: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                cor: true,
                                logo: true
                            }
                        },
                        campeonato: {
                            select: {
                                id: true,
                                nome: true,
                                temporada: true
                            }
                        }
                    }
                },
                jogador: {
                    select: {
                        id: true,
                        nome: true,
                        posicao: true,
                        setor: true
                    }
                },
                time: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true
                    }
                }
            }
        })

        console.log(`✅ [PUT] Estatística ${estatisticaId} atualizada com sucesso`)
        console.log(`   Jogador: ${estatisticaAtualizada.jogador.nome}`)
        console.log(`   Jogo: ${estatisticaAtualizada.jogo.timeCasa?.sigla} vs ${estatisticaAtualizada.jogo.timeVisitante?.sigla}`)
        console.log(`   Data: ${estatisticaAtualizada.jogo.dataJogo}`)

        await recalcularEstatisticasConsolidadas(
            estatisticaAtualizada.jogadorId,
            estatisticaAtualizada.timeId,
            estatisticaAtualizada.temporada || '2026'
        )

        res.json({
            message: 'Estatística de jogo atualizada com sucesso',
            estatistica: {
                id: estatisticaAtualizada.id,
                jogoId: estatisticaAtualizada.jogoId,
                jogadorId: estatisticaAtualizada.jogadorId,
                timeId: estatisticaAtualizada.timeId,
                temporada: estatisticaAtualizada.temporada,
                estatisticas: estatisticaAtualizada.estatisticas,
                jogo: {
                    id: estatisticaAtualizada.jogo.id,
                    dataJogo: estatisticaAtualizada.jogo.dataJogo,
                    status: estatisticaAtualizada.jogo.status,
                    placarCasa: estatisticaAtualizada.jogo.placarCasa,
                    placarVisitante: estatisticaAtualizada.jogo.placarVisitante,
                    rodada: estatisticaAtualizada.jogo.rodada,
                    fase: estatisticaAtualizada.jogo.fase,
                    local: estatisticaAtualizada.jogo.local,
                    timeCasa: estatisticaAtualizada.jogo.timeCasa,
                    timeVisitante: estatisticaAtualizada.jogo.timeVisitante,
                    campeonato: estatisticaAtualizada.jogo.campeonato
                },
                jogador: estatisticaAtualizada.jogador,
                time: estatisticaAtualizada.time
            }
        })

    } catch (error) {
        console.error('❌ [PUT] Erro ao atualizar estatística de jogo:', error)
        res.status(500).json({
            error: 'Erro interno do servidor',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

async function recalcularEstatisticasConsolidadas(
    jogadorId: number,
    timeId: number,
    temporada: string
) {
    console.log(`🔄 [RECALCULO] Jogador ${jogadorId}, Time ${timeId}, Temporada ${temporada}`)

    try {
        const todasEstatisticas = await prisma.estatisticaJogo.findMany({
            where: {
                jogadorId,
                timeId,
                temporada
            }
        })

        console.log(`📊 [RECALCULO] Encontradas ${todasEstatisticas.length} estatísticas de jogo`)

        const estatisticasConsolidadas = {
            passe: {
                passes_completos: 0,
                passes_tentados: 0,
                jardas_de_passe: 0,
                td_passados: 0,
                interceptacoes_sofridas: 0,
                sacks_sofridos: 0,
                fumble_de_passador: 0
            },
            corrida: {
                corridas: 0,
                jardas_corridas: 0,
                tds_corridos: 0,
                fumble_de_corredor: 0
            },
            recepcao: {
                recepcoes: 0,
                alvo: 0,
                jardas_recebidas: 0,
                tds_recebidos: 0
            },
            retorno: {
                retornos: 0,
                jardas_retornadas: 0,
                td_retornados: 0
            },
            defesa: {
                tackles_totais: 0,
                tackles_for_loss: 0,
                sacks_forcado: 0,
                fumble_forcado: 0,
                interceptacao_forcada: 0,
                passe_desviado: 0,
                safety: 0,
                td_defensivo: 0
            },
            kicker: {
                xp_bons: 0,
                tentativas_de_xp: 0,
                fg_bons: 0,
                tentativas_de_fg: 0,
                fg_mais_longo: 0
            },
            punter: {
                punts: 0,
                jardas_de_punt: 0
            }
        }

        todasEstatisticas.forEach((est, index) => {
            const stats = est.estatisticas as any

            if (stats.passe) {
                estatisticasConsolidadas.passe.passes_completos += Number(stats.passe.passes_completos || 0)
                estatisticasConsolidadas.passe.passes_tentados += Number(stats.passe.passes_tentados || 0)
                estatisticasConsolidadas.passe.jardas_de_passe += Number(stats.passe.jardas_de_passe || 0)
                estatisticasConsolidadas.passe.td_passados += Number(stats.passe.td_passados || 0)
                estatisticasConsolidadas.passe.interceptacoes_sofridas += Number(stats.passe.interceptacoes_sofridas || 0)
                estatisticasConsolidadas.passe.sacks_sofridos += Number(stats.passe.sacks_sofridos || 0)
                estatisticasConsolidadas.passe.fumble_de_passador += Number(stats.passe.fumble_de_passador || 0)
            }

            if (stats.corrida) {
                estatisticasConsolidadas.corrida.corridas += Number(stats.corrida.corridas || 0)
                estatisticasConsolidadas.corrida.jardas_corridas += Number(stats.corrida.jardas_corridas || 0)
                estatisticasConsolidadas.corrida.tds_corridos += Number(stats.corrida.tds_corridos || 0)
                estatisticasConsolidadas.corrida.fumble_de_corredor += Number(stats.corrida.fumble_de_corredor || 0)
            }

            if (stats.recepcao) {
                estatisticasConsolidadas.recepcao.recepcoes += Number(stats.recepcao.recepcoes || 0)
                estatisticasConsolidadas.recepcao.alvo += Number(stats.recepcao.alvo || 0)
                estatisticasConsolidadas.recepcao.jardas_recebidas += Number(stats.recepcao.jardas_recebidas || 0)
                estatisticasConsolidadas.recepcao.tds_recebidos += Number(stats.recepcao.tds_recebidos || 0)
            }

            if (stats.retorno) {
                estatisticasConsolidadas.retorno.retornos += Number(stats.retorno.retornos || 0)
                estatisticasConsolidadas.retorno.jardas_retornadas += Number(stats.retorno.jardas_retornadas || 0)
                estatisticasConsolidadas.retorno.td_retornados += Number(stats.retorno.td_retornados || 0)
            }

            if (stats.defesa) {
                estatisticasConsolidadas.defesa.tackles_totais += Number(stats.defesa.tackles_totais || 0)
                estatisticasConsolidadas.defesa.tackles_for_loss += Number(stats.defesa.tackles_for_loss || 0)
                estatisticasConsolidadas.defesa.sacks_forcado += Number(stats.defesa.sacks_forcado || 0)
                estatisticasConsolidadas.defesa.fumble_forcado += Number(stats.defesa.fumble_forcado || 0)
                estatisticasConsolidadas.defesa.interceptacao_forcada += Number(stats.defesa.interceptacao_forcada || 0)
                estatisticasConsolidadas.defesa.passe_desviado += Number(stats.defesa.passe_desviado || 0)
                estatisticasConsolidadas.defesa.safety += Number(stats.defesa.safety || 0)
                estatisticasConsolidadas.defesa.td_defensivo += Number(stats.defesa.td_defensivo || 0)
            }

            if (stats.kicker) {
                estatisticasConsolidadas.kicker.xp_bons += Number(stats.kicker.xp_bons || 0)
                estatisticasConsolidadas.kicker.tentativas_de_xp += Number(stats.kicker.tentativas_de_xp || 0)
                estatisticasConsolidadas.kicker.fg_bons += Number(stats.kicker.fg_bons || 0)
                estatisticasConsolidadas.kicker.tentativas_de_fg += Number(stats.kicker.tentativas_de_fg || 0)

                const fgAtual = Number(stats.kicker.fg_mais_longo || 0)
                if (fgAtual > estatisticasConsolidadas.kicker.fg_mais_longo) {
                    estatisticasConsolidadas.kicker.fg_mais_longo = fgAtual
                }
            }

            if (stats.punter) {
                estatisticasConsolidadas.punter.punts += Number(stats.punter.punts || 0)
                estatisticasConsolidadas.punter.jardas_de_punt += Number(stats.punter.jardas_de_punt || 0)
            }
        })

        const jogadorTime = await prisma.jogadorTime.findFirst({
            where: { jogadorId, timeId, temporada }
        })

        if (jogadorTime) {
            await prisma.jogadorTime.update({
                where: { id: jogadorTime.id },
                data: { estatisticas: estatisticasConsolidadas }
            })

            console.log(`✅ [RECALCULO] Consolidado atualizado:`, {
                jogadorId,
                timeId,
                fg_bons: estatisticasConsolidadas.kicker.fg_bons,
                tentativas_de_fg: estatisticasConsolidadas.kicker.tentativas_de_fg
            })
        } else {
            console.warn(`⚠️ [RECALCULO] JogadorTime não encontrado para jogador ${jogadorId}, time ${timeId}`)
        }

    } catch (error) {
        console.error(`❌ [RECALCULO] Erro ao recalcular estatísticas:`, error)
        throw error
    }
}

adminRouter.put('/jogos/:id/gerenciar', async (req, res) => {
    try {
        const { id } = req.params
        const {
            placarCasa,
            placarVisitante,
            dataJogo,
            local,
            observacoes,
            status,
            timeCasaId,
            timeVisitanteId
        } = req.body

        console.log(`Atualizando jogo ${id} com dados:`, req.body)

        const jogoExistente = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } },
                campeonato: { select: { divisao: true } }
            }
        })

        if (!jogoExistente) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        const dadosAtualizacao: any = {}

        // Define/corrige o confronto de um jogo (ex: preencher os times de um
        // jogo de playoff que ainda está "a definir"). Cada lado é independente:
        // número = define o time, null/'' = volta para "a definir", ausente =
        // mantém o que já está. Os times precisam ser da mesma temporada e
        // divisão do jogo.
        if (timeCasaId !== undefined || timeVisitanteId !== undefined) {
            const parseTimeId = (valor: unknown): number | null | undefined => {
                if (valor === undefined) return undefined
                if (valor === null || valor === '') return null
                return Number(valor)
            }

            const casaId = parseTimeId(timeCasaId)
            const visitanteId = parseTimeId(timeVisitanteId)

            if ((casaId !== undefined && casaId !== null && !Number.isInteger(casaId)) ||
                (visitanteId !== undefined && visitanteId !== null && !Number.isInteger(visitanteId))) {
                res.status(400).json({ error: 'ID de time inválido' })
                return
            }

            const casaFinal = casaId === undefined ? jogoExistente.timeCasaId : casaId
            const visitanteFinal = visitanteId === undefined ? jogoExistente.timeVisitanteId : visitanteId

            if (casaFinal !== null && casaFinal === visitanteFinal) {
                res.status(400).json({ error: 'Os times mandante e visitante não podem ser o mesmo' })
                return
            }

            for (const [lado, id] of [['mandante', casaId], ['visitante', visitanteId]] as const) {
                if (id === undefined || id === null) continue

                const time = await prisma.time.findUnique({ where: { id } })
                if (!time) {
                    res.status(404).json({ error: `Time ${lado} não encontrado` })
                    return
                }

                if (jogoExistente.temporada && time.temporada !== jogoExistente.temporada) {
                    res.status(400).json({ error: `O time ${lado} precisa ser da temporada ${jogoExistente.temporada}` })
                    return
                }

                const divisaoJogo = jogoExistente.campeonato?.divisao
                if (divisaoJogo && time.divisao !== divisaoJogo) {
                    res.status(400).json({ error: `O time ${lado} precisa ser da divisão ${divisaoJogo}` })
                    return
                }
            }

            if (casaId !== undefined) dadosAtualizacao.timeCasaId = casaId
            if (visitanteId !== undefined) dadosAtualizacao.timeVisitanteId = visitanteId
        }

        if (placarCasa !== undefined) {
            if (placarCasa < 0) {
                res.status(400).json({ error: 'Placar casa não pode ser negativo' })
                return
            }
            dadosAtualizacao.placarCasa = parseInt(placarCasa)
        }

        if (placarVisitante !== undefined) {
            if (placarVisitante < 0) {
                res.status(400).json({ error: 'Placar visitante não pode ser negativo' })
                return
            }
            dadosAtualizacao.placarVisitante = parseInt(placarVisitante)
        }

        if (dataJogo) {
            try {
                const novaData = new Date(dataJogo)
                if (isNaN(novaData.getTime())) {
                    res.status(400).json({ error: 'Data do jogo inválida' })
                    return
                }
                dadosAtualizacao.dataJogo = novaData
            } catch (error) {
                res.status(400).json({ error: 'Formato de data inválido' })
                return
            }
        }

        if (local !== undefined) {
            dadosAtualizacao.local = local.trim() || null
        }

        if (observacoes !== undefined) {
            dadosAtualizacao.observacoes = observacoes.trim() || null
        }

        if (status) {
            const statusValidos = ['AGENDADO', 'AO VIVO', 'FINALIZADO', 'ADIADO', 'CANCELADO']
            if (!statusValidos.includes(status)) {
                res.status(400).json({
                    error: 'Status inválido',
                    statusValidos
                })
                return
            }
            dadosAtualizacao.status = status
        }

        // Em jogos de playoff finalizados, registra o time vencedor (a importação
        // de resultados já faz isso; edição manual pelo painel também deve fazer)
        const statusFinal = dadosAtualizacao.status ?? jogoExistente.status
        if (statusFinal === 'FINALIZADO' && jogoExistente.fase !== 'TEMPORADA REGULAR') {
            const placarCasaFinal = dadosAtualizacao.placarCasa ?? jogoExistente.placarCasa
            const placarVisitanteFinal = dadosAtualizacao.placarVisitante ?? jogoExistente.placarVisitante
            const timeCasaFinal = dadosAtualizacao.timeCasaId !== undefined ? dadosAtualizacao.timeCasaId : jogoExistente.timeCasaId
            const timeVisitanteFinal = dadosAtualizacao.timeVisitanteId !== undefined ? dadosAtualizacao.timeVisitanteId : jogoExistente.timeVisitanteId

            if (
                placarCasaFinal !== null && placarCasaFinal !== undefined &&
                placarVisitanteFinal !== null && placarVisitanteFinal !== undefined &&
                placarCasaFinal !== placarVisitanteFinal
            ) {
                dadosAtualizacao.timeVencedorId = placarCasaFinal > placarVisitanteFinal
                    ? timeCasaFinal
                    : timeVisitanteFinal
            }
        }

        if (Object.keys(dadosAtualizacao).length === 0) {
            res.status(400).json({ error: 'Nenhum dado fornecido para atualização' })
            return
        }

        const jogoAtualizado = await prisma.jogo.update({
            where: { id: parseInt(id) },
            data: dadosAtualizacao,
            include: {
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                campeonato: {
                    select: {
                        id: true,
                        nome: true,
                        temporada: true
                    }
                }
            }
        })

        console.log(`✅ Jogo ${id} atualizado com sucesso:`)
        console.log(`   ${jogoAtualizado.timeCasa?.sigla} vs ${jogoAtualizado.timeVisitante?.sigla}`)
        console.log(`   Data: ${jogoAtualizado.dataJogo}`)
        console.log(`   Local: ${jogoAtualizado.local || 'Não definido'}`)
        console.log(`   Status: ${jogoAtualizado.status}`)
        if (jogoAtualizado.placarCasa !== null && jogoAtualizado.placarVisitante !== null) {
            console.log(`   Placar: ${jogoAtualizado.placarCasa} x ${jogoAtualizado.placarVisitante}`)
        }

        res.json({
            message: 'Jogo atualizado com sucesso',
            jogo: jogoAtualizado,
            alteracoes: Object.keys(dadosAtualizacao)
        })

    } catch (error) {
        console.error('❌ Erro ao atualizar jogo:', error)
        res.status(500).json({
            error: 'Erro interno ao atualizar jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.post('/reset-database', async (req, res) => {
    try {
        console.log('🗑️ Iniciando reset do banco de dados via API...')

        console.log('📊 Limpando dados das tabelas...')

        await prisma.estatisticaJogo.deleteMany()
        console.log('   ✅ EstatisticaJogo limpa')

        await prisma.jogo.deleteMany()
        console.log('   ✅ Jogo limpa')

        await prisma.distribuicaoTime.deleteMany()
        console.log('   ✅ DistribuicaoTime limpa')

        await prisma.regional.deleteMany()
        console.log('   ✅ Regional limpa')

        await prisma.conferencia.deleteMany()
        console.log('   ✅ Conferencia limpa')

        await prisma.campeonato.deleteMany()
        console.log('   ✅ Campeonato limpa')

        await prisma.jogadorTime.deleteMany()
        console.log('   ✅ JogadorTime limpa')

        await prisma.jogador.deleteMany()
        console.log('   ✅ Jogador limpa')

        await prisma.time.deleteMany()
        console.log('   ✅ Time limpa')

        console.log('🔄 Resetando sequences...')

        try {
            await prisma.$executeRaw`ALTER SEQUENCE "Time_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Conferencia_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Regional_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "DistribuicaoTime_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1`

            console.log('✅ Sequences resetadas com sucesso!')
        } catch (error) {
            console.error('⚠️ Erro ao resetar sequences:', error)
        }

        const counts = await Promise.all([
            prisma.time.count(),
            prisma.jogador.count(),
            prisma.jogadorTime.count(),
            prisma.campeonato.count(),
            prisma.conferencia.count(),
            prisma.regional.count(),
            prisma.distribuicaoTime.count(),
            prisma.jogo.count(),
            prisma.estatisticaJogo.count(),
        ])

        console.log('📊 Verificação final:')
        console.log(`   Times: ${counts[0]}`)
        console.log(`   Jogadores: ${counts[1]}`)
        console.log(`   Jogador-Time: ${counts[2]}`)
        console.log(`   Campeonatos: ${counts[3]}`)
        console.log(`   Conferências: ${counts[4]}`)
        console.log(`   Regionais: ${counts[5]}`)
        console.log(`   Distribuições: ${counts[6]}`)
        console.log(`   Jogos: ${counts[7]}`)
        console.log(`   Estatísticas: ${counts[8]}`)
        console.log(`   📰 Matérias: PRESERVADAS`)

        res.json({
            message: 'Banco de dados resetado com sucesso (matérias preservadas)',
            detalhes: {
                tabelas_limpas: 9,
                tabelas_preservadas: ['Materia'],
                sequences_resetadas: 9,
                verificacao: {
                    times: counts[0],
                    jogadores: counts[1],
                    jogadorTime: counts[2],
                    campeonatos: counts[3],
                    conferencias: counts[4],
                    regionais: counts[5],
                    distribuicoes: counts[6],
                    jogos: counts[7],
                    estatisticas: counts[8],
                    materias: 'preservadas'
                }
            }
        })

    } catch (error) {
        console.error('❌ Erro no reset do banco:', error)
        res.status(500).json({
            error: 'Erro ao resetar banco de dados',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/exportar-estatisticas', async (req, res) => {
    try {
        const { temporada = '2026' } = req.query

        console.log(`📊 Gerando dados para exportação - Temporada: ${temporada}`)

        // 1️⃣ Buscar todos os jogadores com suas estatísticas consolidadas
        const jogadoresComEstatisticas = await prisma.jogador.findMany({
            where: {
                times: {
                    some: {
                        temporada: temporada as string
                    }
                }
            },
            include: {
                times: {
                    where: {
                        temporada: temporada as string
                    },
                    include: {
                        time: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true,
                                logo: true,
                                cor: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                nome: 'asc'
            }
        })

        console.log(`✅ Encontrados ${jogadoresComEstatisticas.length} jogadores`)

        // 2️⃣ Formatar os dados para exportação
        const dadosExportacao = jogadoresComEstatisticas.flatMap(jogador => {
            return jogador.times.map(jogadorTime => {
                const stats = jogadorTime.estatisticas as any

                return {
                    // Dados básicos
                    nome: jogador.nome,
                    numero: jogadorTime.numero,
                    time: jogadorTime.time.nome,
                    sigla: jogadorTime.time.sigla,
                    posicao: jogador.posicao || 'N/A',
                    setor: jogador.setor || 'N/A',

                    // Estatísticas de Passe
                    passes_completos: stats?.passe?.passes_completos || 0,
                    passes_tentados: stats?.passe?.passes_tentados || 0,
                    jardas_de_passe: stats?.passe?.jardas_de_passe || 0,
                    td_passados: stats?.passe?.td_passados || 0,
                    interceptacoes_sofridas: stats?.passe?.interceptacoes_sofridas || 0,
                    sacks_sofridos: stats?.passe?.sacks_sofridos || 0,
                    fumble_de_passador: stats?.passe?.fumble_de_passador || 0,

                    // Estatísticas de Corrida
                    corridas: stats?.corrida?.corridas || 0,
                    jardas_corridas: stats?.corrida?.jardas_corridas || 0,
                    tds_corridos: stats?.corrida?.tds_corridos || 0,
                    fumble_de_corredor: stats?.corrida?.fumble_de_corredor || 0,

                    // Estatísticas de Recepção
                    recepcoes: stats?.recepcao?.recepcoes || 0,
                    alvo: stats?.recepcao?.alvo || 0,
                    jardas_recebidas: stats?.recepcao?.jardas_recebidas || 0,
                    tds_recebidos: stats?.recepcao?.tds_recebidos || 0,

                    // Estatísticas de Retorno
                    retornos: stats?.retorno?.retornos || 0,
                    jardas_retornadas: stats?.retorno?.jardas_retornadas || 0,
                    td_retornados: stats?.retorno?.td_retornados || 0,

                    // Estatísticas de Defesa
                    tackles_totais: stats?.defesa?.tackles_totais || 0,
                    tackles_for_loss: stats?.defesa?.tackles_for_loss || 0,
                    sacks_forcado: stats?.defesa?.sacks_forcado || 0,
                    fumble_forcado: stats?.defesa?.fumble_forcado || 0,
                    interceptacao_forcada: stats?.defesa?.interceptacao_forcada || 0,
                    passe_desviado: stats?.defesa?.passe_desviado || 0,
                    safety: stats?.defesa?.safety || 0,
                    td_defensivo: stats?.defesa?.td_defensivo || 0,

                    // Estatísticas de Kicker
                    xp_bons: stats?.kicker?.xp_bons || 0,
                    tentativas_de_xp: stats?.kicker?.tentativas_de_xp || 0,
                    fg_bons: stats?.kicker?.fg_bons || 0,
                    tentativas_de_fg: stats?.kicker?.tentativas_de_fg || 0,
                    fg_mais_longo: stats?.kicker?.fg_mais_longo || 0,

                    // Estatísticas de Punter
                    punts: stats?.punter?.punts || 0,
                    jardas_de_punt: stats?.punter?.jardas_de_punt || 0,

                    // Dados adicionais
                    idade: jogador.idade || 0,
                    altura: jogador.altura || 0,
                    peso: jogador.peso || 0,
                    experiencia: jogador.experiencia || 0,
                    cidade: jogador.cidade || '',
                    nacionalidade: jogador.nacionalidade || '',
                    timeFormador: jogador.timeFormador || '',
                    temporada: jogadorTime.temporada
                }
            })
        })

        console.log(`✅ Dados formatados: ${dadosExportacao.length} registros`)

        res.json({
            success: true,
            data: dadosExportacao,
            meta: {
                total: dadosExportacao.length,
                temporada: temporada,
                dataGeracao: new Date().toISOString()
            }
        })

    } catch (error) {
        console.error('❌ Erro ao gerar dados para exportação:', error)
        res.status(500).json({
            success: false,
            error: 'Erro ao gerar dados para exportação',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

export default adminRouter