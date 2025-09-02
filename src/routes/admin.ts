import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx'
import multer from 'multer'
import { calcularClassificacaoPorConferencia } from '../utils/distribuicaoUtils';

const prisma = new PrismaClient()

export const adminRouter = express.Router()

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

        let timesRaw = xlsx.utils.sheet_to_json(timeSheet) as any[];

        const times = timesRaw.map(time => ({
            ...time,
            temporada: time.temporada ? String(time.temporada) : '2025'
        }));

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        for (const time of times) {
            try {
                console.log(`Processando time: ${time.nome}, temporada: ${time.temporada}`);

                if (!time.nome || !time.sigla || !time.cor) {
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                const timeExistente = await prisma.time.findFirst({
                    where: {
                        nome: time.nome,
                        temporada: String(time.temporada)
                    }
                });

                if (timeExistente) {
                    await prisma.time.update({
                        where: { id: timeExistente.id },
                        data: {
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            fundacao: time.fundacao || '',
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
                            titulos: time.titulos || []
                        }
                    });
                } else {
                    await prisma.time.create({
                        data: {
                            nome: time.nome,
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            fundacao: time.fundacao || '',
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
                            titulos: time.titulos || [],
                            temporada: String(time.temporada)
                        }
                    });
                }

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar time ${time.nome}:`, error);
                resultados.erros.push({
                    time: time.nome || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
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

        console.log(`📁 Arquivo recebido: ${req.file.originalname} (${req.file.size} bytes)`)

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
        const planilha = workbook.Sheets[workbook.SheetNames[0]]
        const dadosJogadores = xlsx.utils.sheet_to_json(planilha)

        console.log(`📊 Total de linhas na planilha: ${dadosJogadores.length}`)

        const resultados = {
            totalLinhas: dadosJogadores.length,
            jogadoresImportados: 0,
            jogadoresDuplicados: 0,
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
                        temporada: '2025'
                    }
                })

                if (!time) {
                    resultados.errosTime++
                    resultados.detalhesErros.push({
                        linha: linhaAtual,
                        nome: jogador.nome,
                        time: jogador.time_nome,
                        erro: `Time "${jogador.time_nome}" não encontrado`
                    })
                    continue
                }

                const jogadorExistente = await prisma.jogador.findFirst({
                    where: {
                        nome: jogador.nome,
                        times: {
                            some: {
                                timeId: time.id,
                                temporada: '2025'
                            }
                        }
                    }
                })

                if (jogadorExistente) {
                    resultados.jogadoresDuplicados++
                    resultados.detalhesErros.push({
                        linha: linhaAtual,
                        nome: jogador.nome,
                        time: jogador.time_nome,
                        erro: 'Jogador já existe neste time'
                    })
                    continue
                }

                const estatisticas = {
                    passe: {
                        passes_completos: Number(jogador.passes_completos || 0),
                        passes_tentados: Number(jogador.passes_tentados || 0),
                        jardas_de_passe: Number(jogador.jardas_de_passe || 0),
                        td_passados: Number(jogador.td_passados || 0),
                        interceptacoes_sofridas: Number(jogador.interceptacoes_sofridas || 0),
                        sacks_sofridos: Number(jogador.sacks_sofridos || 0),
                        fumble_de_passador: Number(jogador.fumble_de_passador || 0)
                    },
                    corrida: {
                        corridas: Number(jogador.corridas || 0),
                        jardas_corridas: Number(jogador.jardas_corridas || 0),
                        tds_corridos: Number(jogador.tds_corridos || 0),
                        fumble_de_corredor: Number(jogador.fumble_de_corredor || 0)
                    },
                    recepcao: {
                        recepcoes: Number(jogador.recepcoes || 0),
                        alvo: Number(jogador.alvo || 0),
                        jardas_recebidas: Number(jogador.jardas_recebidas || 0),
                        tds_recebidos: Number(jogador.tds_recebidos || 0)
                    },
                    retorno: {
                        retornos: Number(jogador.retornos || 0),
                        jardas_retornadas: Number(jogador.jardas_retornadas || 0),
                        td_retornados: Number(jogador.td_retornados || 0)
                    },
                    defesa: {
                        tackles_totais: Number(jogador.tackles_totais || 0),
                        tackles_for_loss: Number(jogador.tackles_for_loss || 0),
                        sacks_forcado: Number(jogador.sacks_forcado || 0),
                        fumble_forcado: Number(jogador.fumble_forcado || 0),
                        interceptacao_forcada: Number(jogador.interceptacao_forcada || 0),
                        passe_desviado: Number(jogador.passe_desviado || 0),
                        safety: Number(jogador.safety || 0),
                        td_defensivo: Number(jogador.td_defensivo || 0)
                    },
                    kicker: {
                        xp_bons: Number(jogador.xp_bons || 0),
                        tentativas_de_xp: Number(jogador.tentativas_de_xp || 0),
                        fg_bons: Number(jogador.fg_bons || 0),
                        tentativas_de_fg: Number(jogador.tentativas_de_fg || 0),
                        fg_mais_longo: Number(jogador.fg_mais_longo || 0)
                    },
                    punter: {
                        punts: Number(jogador.punts || 0),
                        jardas_de_punt: Number(jogador.jardas_de_punt || 0)
                    }
                }

                const novoJogador = await prisma.jogador.create({
                    data: {
                        nome: jogador.nome,
                        posicao: jogador.posicao || '',
                        setor: jogador.setor || 'Ataque',
                        experiencia: Number(jogador.experiencia || 0),
                        idade: Number(jogador.idade || 0),
                        altura: parseFloat(jogador.altura || '0'),
                        peso: Number(jogador.peso || 0),
                        instagram: jogador.instagram || '',
                        instagram2: jogador.instagram2 || '',
                        cidade: jogador.cidade || '',
                        nacionalidade: jogador.nacionalidade || '',
                        timeFormador: jogador.time_formador || ''
                    }
                })

                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: novoJogador.id,
                        timeId: time.id,
                        temporada: '2025',
                        numero: Number(jogador.numero || 0),
                        camisa: jogador.camisa || '',
                        estatisticas: estatisticas
                    }
                })

                resultados.jogadoresImportados++

                if (resultados.jogadoresImportados % 50 === 0) {
                    console.log(`📈 Progresso: ${resultados.jogadoresImportados} jogadores importados...`)
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

        console.log('\n' + '='.repeat(60))
        console.log('📊 RELATÓRIO FINAL DA IMPORTAÇÃO DE JOGADORES')
        console.log('='.repeat(60))
        console.log(`📋 Total de linhas processadas: ${resultados.totalLinhas}`)
        console.log(`✅ Jogadores importados com sucesso: ${resultados.jogadoresImportados}`)
        console.log(`⚠️  Jogadores duplicados (ignorados): ${resultados.jogadoresDuplicados}`)
        console.log(`❌ Erros de validação: ${resultados.errosValidacao}`)
        console.log(`❌ Erros de time não encontrado: ${resultados.errosTime}`)
        console.log(`❌ Erros gerais: ${resultados.errosGerais}`)
        console.log(`📈 Taxa de sucesso: ${((resultados.jogadoresImportados / resultados.totalLinhas) * 100).toFixed(1)}%`)
        console.log('='.repeat(60))

        if (resultados.detalhesErros.length > 0) {
            console.log('\n🔍 PRIMEIROS 10 ERROS DETALHADOS:')
            resultados.detalhesErros.slice(0, 10).forEach((erro, index) => {
                console.log(`${index + 1}. Linha ${erro.linha}: ${erro.nome || 'Nome não informado'} (${erro.time || 'Time não informado'}) - ${erro.erro}`)
            })

            if (resultados.detalhesErros.length > 10) {
                console.log(`... e mais ${resultados.detalhesErros.length - 10} erros`)
            }
        }

        const totalJogadoresNoBanco = await prisma.jogadorTime.count({
            where: { temporada: '2025' }
        })

        console.log(`\n🎯 VERIFICAÇÃO: ${totalJogadoresNoBanco} jogadores-time no banco para temporada 2025`)

        res.status(200).json({
            message: 'Importação de jogadores concluída',
            arquivo: req.file.originalname,
            resultados: {
                totalLinhas: resultados.totalLinhas,
                jogadoresImportados: resultados.jogadoresImportados,
                jogadoresDuplicados: resultados.jogadoresDuplicados,
                errosValidacao: resultados.errosValidacao,
                errosTime: resultados.errosTime,
                errosGerais: resultados.errosGerais,
                taxaSucesso: `${((resultados.jogadoresImportados / resultados.totalLinhas) * 100).toFixed(1)}%`,
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

        const superliga = await prisma.campeonato.findFirst({
            where: {
                temporada: '2025',
                isSuperliga: true
            }
        })

        if (!superliga) {
            res.status(400).json({ error: 'Crie a Superliga 2025 antes de importar a agenda' })
            return
        }

        console.log(`✅ Superliga encontrada: ID ${superliga.id}`)

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jogosRaw = xlsx.utils.sheet_to_json(worksheet)

        console.log(`📊 Total de jogos na planilha: ${jogosRaw.length}`)

        if (jogosRaw.length === 0) {
            res.status(400).json({ error: 'A planilha está vazia ou não contém dados válidos' })
            return
        }

        const times = await prisma.time.findMany({
            where: { temporada: '2025' },
            select: { id: true, nome: true, sigla: true }
        })

        console.log(`📋 Times encontrados no banco: ${times.length}`)

        const mapaTimes = new Map<string, { id: number; nome: string; sigla: string }>()
        times.forEach(time => {
            mapaTimes.set(time.nome.toLowerCase().trim(), time)
        })

        const resultados = {
            jogosImportados: 0,
            jogosPulados: 0,
            jogosPlayoffs: 0,
            erros: [] as Array<{ linha: number; erro: string }>,
            warnings: [] as Array<{ linha: number; warning: string }>
        }

        console.log('🚀 Iniciando processamento dos jogos...')

        for (let i = 0; i < jogosRaw.length; i++) {
            const jogoData = jogosRaw[i] as any
            const linha = i + 1

            try {
                const dataJogo = jogoData.data instanceof Date ? jogoData.data :
                    typeof jogoData.data === 'number' ?
                        new Date((jogoData.data - 25569) * 86400 * 1000) :
                        new Date(jogoData.data)
                if (isNaN(dataJogo.getTime())) {
                    resultados.erros.push({
                        linha,
                        erro: `Data inválida: "${jogoData.data}"`
                    })
                    continue
                }

                const nomeTimeCasa = jogoData.time_mandante?.toString()?.trim() || ''
                const nomeTimeVisitante = jogoData.time_visitante?.toString()?.trim() || ''
                const isJogoPlayoff = !nomeTimeCasa || !nomeTimeVisitante ||
                    nomeTimeCasa === '' || nomeTimeVisitante === '' ||
                    nomeTimeCasa.toLowerCase() === 'tbd' || nomeTimeVisitante.toLowerCase() === 'tbd' ||
                    nomeTimeCasa.toLowerCase().includes('a definir') || nomeTimeVisitante.toLowerCase().includes('a definir')

                if (isJogoPlayoff) {
                    await prisma.jogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            timeCasaId: null,
                            timeVisitanteId: null,
                            dataJogo: dataJogo,
                            local: jogoData.local || 'A definir',
                            rodada: parseInt(jogoData.rodada?.toString() || '1'),
                            fase: jogoData.fase || 'WILD CARD',
                            status: 'AGENDADO',
                            observacoes: jogoData.observacoes || 'Aguardando definição dos times',
                            conferencia: jogoData.conferencia || null,
                            regional: jogoData.regional || null,
                            temporada: '2025'
                        }
                    })

                    resultados.jogosPlayoffs++
                    resultados.warnings.push({
                        linha,
                        warning: `Jogo ${jogoData.id_jogo || linha} criado como playoff - times serão definidos posteriormente`
                    })

                    console.log(`🏆 Jogo playoff criado: ID ${jogoData.id_jogo || linha} - times a definir`)

                } else {
                    const timeCasa = mapaTimes.get(nomeTimeCasa.toLowerCase())
                    const timeVisitante = mapaTimes.get(nomeTimeVisitante.toLowerCase())

                    if (!timeCasa) {
                        resultados.erros.push({
                            linha,
                            erro: `Time mandante não encontrado: "${nomeTimeCasa}"`
                        })
                        continue
                    }

                    if (!timeVisitante) {
                        resultados.erros.push({
                            linha,
                            erro: `Time visitante não encontrado: "${nomeTimeVisitante}"`
                        })
                        continue
                    }

                    await prisma.jogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            timeCasaId: timeCasa.id,
                            timeVisitanteId: timeVisitante.id,
                            dataJogo: dataJogo,
                            local: jogoData.local || timeCasa.nome,
                            rodada: parseInt(jogoData.rodada?.toString() || '1'),
                            fase: jogoData.fase || 'TEMPORADA REGULAR',
                            status: 'AGENDADO',
                            observacoes: jogoData.observacoes || null,
                            conferencia: jogoData.conferencia || null,
                            regional: jogoData.regional || null,
                            temporada: '2025'
                        }
                    })

                    resultados.jogosImportados++
                    console.log(`✅ Jogo temporada regular: ${timeCasa.sigla} vs ${timeVisitante.sigla}`)
                }

                if ((resultados.jogosImportados + resultados.jogosPlayoffs) % 10 === 0) {
                    console.log(`📊 Processados: ${resultados.jogosImportados} temporada regular, ${resultados.jogosPlayoffs} playoffs`)
                }

            } catch (error) {
                resultados.erros.push({
                    linha,
                    erro: `Erro interno: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
                })
                console.error(`❌ Erro na linha ${linha}:`, error)
            }
        }

        const resposta = {
            message: `Agenda importada com sucesso!`,
            resumo: {
                jogosTemporadaRegular: resultados.jogosImportados,
                jogosPlayoffs: resultados.jogosPlayoffs,
                totalJogos: resultados.jogosImportados + resultados.jogosPlayoffs,
                jogosPulados: resultados.jogosPulados,
                jogosComErro: resultados.erros.length,
                totalProcessado: jogosRaw.length
            },
            detalhes: {
                totalLinhas: jogosRaw.length,
                erros: resultados.erros.length > 0 ? resultados.erros : undefined,
                warnings: resultados.warnings.length > 0 ? resultados.warnings : undefined
            },
            proximaEtapa: 'Importe os resultados da temporada regular. Os playoffs serão atualizados conforme você importar seus resultados.'
        }

        console.log('✅ Importação da agenda finalizada:')
        console.log(`   📊 Jogos temporada regular: ${resultados.jogosImportados}`)
        console.log(`   🏆 Jogos playoffs: ${resultados.jogosPlayoffs}`)
        console.log(`   ⏭️ Jogos pulados: ${resultados.jogosPulados}`)
        console.log(`   ❌ Erros: ${resultados.erros.length}`)
        console.log(`   ⚠️ Warnings: ${resultados.warnings.length}`)

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
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true }
        })

        if (!superliga) {
            res.status(404).json({ error: 'Superliga 2025 não encontrada' })
            return
        }

        const { id_jogo, data_jogo } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        console.log('🔍 Validando status do jogo...');

        const jogo = await prisma.jogo.findUnique({
            where: { id: Number(id_jogo) },
            select: {
                id: true,
                status: true,
                dataJogo: true,
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        });

        if (!jogo) {
            console.error(`❌ Jogo ${id_jogo} não encontrado`);
            res.status(400).json({
                error: `Jogo ${id_jogo} não encontrado`
            });
            return;
        }

        if (jogo.status !== 'FINALIZADO') {
            console.error(`❌ Tentativa de inserir estatísticas para jogo ${id_jogo} com status: ${jogo.status}`);
            console.error(`   Jogo: ${jogo.timeCasa?.nome || 'A definir'} vs ${jogo.timeVisitante?.nome || 'A Definir'}`);

            res.status(400).json({
                error: `Não é possível inserir estatísticas para jogo com status: ${jogo.status}`,
                detalhes: {
                    jogoId: id_jogo,
                    status: jogo.status,
                    confronto: `${jogo.timeCasa?.nome || 'A definir'} vs ${jogo.timeVisitante?.nome || 'A definir'}`,
                    data: jogo.dataJogo,
                    statusPermitido: 'FINALIZADO'
                }
            });
            return;
        }

        console.log(`✅ Jogo ${id_jogo} validado para inserção de estatísticas`);
        console.log(`   Status: ${jogo.status}`);
        console.log(`   Confronto: ${jogo.timeCasa?.sigla} vs ${jogo.timeVisitante?.sigla}`);

        console.log('📊 INICIANDO DUPLA INSERÇÃO DE ESTATÍSTICAS...');
        console.log(`🎯 Jogo: ${id_jogo}, Data: ${data_jogo}`);

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        const resultados = {
            sucesso: 0,
            sucessoConsolidado: 0,
            sucessoJogoAJogo: 0,
            erros: [] as any[]
        };

        for (const stat of estatisticasJogo) {
            try {
                if (!stat.jogador_id && !stat.jogador_nome) {
                    resultados.erros.push({
                        linha: JSON.stringify(stat),
                        erro: 'ID ou nome do jogador é obrigatório'
                    });
                    continue;
                }

                const temporada = String(stat.temporada || '2025');

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
                        }
                    });

                    if (!jogadorTimes || jogadorTimes.length === 0) {
                        throw new Error(`Jogador ID ${jogadorId} não tem relação com time na temporada ${temporada}`);
                    }

                    jogadorTime = jogadorTimes[0];

                } else if (stat.jogador_nome) {
                    jogador = await prisma.jogador.findFirst({
                        where: {
                            nome: {
                                contains: stat.jogador_nome,
                                mode: 'insensitive'
                            }
                        }
                    });

                    if (!jogador) {
                        throw new Error(`Jogador "${stat.jogador_nome}" não encontrado`);
                    }

                    const jogadorTimes = await prisma.jogadorTime.findMany({
                        where: {
                            jogadorId: jogador.id,
                            temporada: temporada
                        }
                    });

                    if (jogadorTimes.length === 0) {
                        throw new Error(`Jogador "${stat.jogador_nome}" não tem relação com time na temporada ${temporada}`);
                    }

                    jogadorTime = jogadorTimes[0];
                }

                if (!jogador || !jogadorTime) {
                    throw new Error('Não foi possível identificar jogador ou time');
                }

                const estatisticasEstruturadas = {
                    passe: {
                        jardas_de_passe: Number(stat.jardas_de_passe || 0),
                        passes_completos: Number(stat.passes_completos || 0),
                        passes_tentados: Number(stat.passes_tentados || 0),
                        td_passados: Number(stat.td_passados || 0),
                        interceptacoes_sofridas: Number(stat.interceptacoes_sofridas || 0),
                        sacks_sofridos: Number(stat.sacks_sofridos || 0),
                        fumble_de_passador: Number(stat.fumble_de_passador || 0)
                    },
                    corrida: {
                        jardas_corridas: Number(stat.jardas_corridas || 0),
                        corridas: Number(stat.corridas || 0),
                        tds_corridos: Number(stat.tds_corridos || 0),
                        fumble_de_corredor: Number(stat.fumble_de_corredor || 0)
                    },
                    recepcao: {
                        jardas_recebidas: Number(stat.jardas_recebidas || 0),
                        recepcoes: Number(stat.recepcoes || 0),
                        alvo: Number(stat.alvo || 0),
                        tds_recebidos: Number(stat.tds_recebidos || 0)
                    },
                    retorno: {
                        jardas_retornadas: Number(stat.jardas_retornadas || 0),
                        retornos: Number(stat.retornos || 0),
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

                try {
                    await prisma.estatisticaJogo.upsert({
                        where: {
                            jogoId_jogadorId: {
                                jogoId: Number(id_jogo),
                                jogadorId: jogador.id
                            }
                        },
                        update: {
                            estatisticas: estatisticasEstruturadas,
                            temporada: temporada,
                            rodada: Number(stat.rodada || 1),
                            fase: stat.fase || 'TEMPORADA REGULAR'
                        },
                        create: {
                            jogoId: Number(id_jogo),
                            jogadorId: jogador.id,
                            timeId: jogadorTime.timeId,
                            campeonatoId: superliga.id,
                            estatisticas: estatisticasEstruturadas,
                            temporada: temporada,
                            rodada: Number(stat.rodada || 1),
                            fase: stat.fase || 'TEMPORADA REGULAR'
                        }
                    });

                    resultados.sucessoJogoAJogo++;
                    console.log(`✅ [JOGO A JOGO] ${jogador.nome} - Jogo ${id_jogo}`);

                } catch (error) {
                    console.error(`❌ [JOGO A JOGO] Erro para ${jogador.nome}:`, error);
                    resultados.erros.push({
                        jogador: jogador.nome,
                        tipo: 'jogo_a_jogo',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }

                try {
                    const estatisticasAtuais = jogadorTime.estatisticas as any || {};

                    const estatisticasConsolidadas = {
                        passe: {
                            jardas_de_passe: (estatisticasAtuais.passe?.jardas_de_passe || 0) + estatisticasEstruturadas.passe.jardas_de_passe,
                            passes_completos: (estatisticasAtuais.passe?.passes_completos || 0) + estatisticasEstruturadas.passe.passes_completos,
                            passes_tentados: (estatisticasAtuais.passe?.passes_tentados || 0) + estatisticasEstruturadas.passe.passes_tentados,
                            td_passados: (estatisticasAtuais.passe?.td_passados || 0) + estatisticasEstruturadas.passe.td_passados,
                            interceptacoes_sofridas: (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) + estatisticasEstruturadas.passe.interceptacoes_sofridas,
                            sacks_sofridos: (estatisticasAtuais.passe?.sacks_sofridos || 0) + estatisticasEstruturadas.passe.sacks_sofridos,
                            fumble_de_passador: (estatisticasAtuais.passe?.fumble_de_passador || 0) + estatisticasEstruturadas.passe.fumble_de_passador
                        },
                        corrida: {
                            jardas_corridas: (estatisticasAtuais.corrida?.jardas_corridas || 0) + estatisticasEstruturadas.corrida.jardas_corridas,
                            corridas: (estatisticasAtuais.corrida?.corridas || 0) + estatisticasEstruturadas.corrida.corridas,
                            tds_corridos: (estatisticasAtuais.corrida?.tds_corridos || 0) + estatisticasEstruturadas.corrida.tds_corridos,
                            fumble_de_corredor: (estatisticasAtuais.corrida?.fumble_de_corredor || 0) + estatisticasEstruturadas.corrida.fumble_de_corredor
                        },
                        recepcao: {
                            jardas_recebidas: (estatisticasAtuais.recepcao?.jardas_recebidas || 0) + estatisticasEstruturadas.recepcao.jardas_recebidas,
                            recepcoes: (estatisticasAtuais.recepcao?.recepcoes || 0) + estatisticasEstruturadas.recepcao.recepcoes,
                            alvo: (estatisticasAtuais.recepcao?.alvo || 0) + estatisticasEstruturadas.recepcao.alvo,
                            tds_recebidos: (estatisticasAtuais.recepcao?.tds_recebidos || 0) + estatisticasEstruturadas.recepcao.tds_recebidos
                        },
                        retorno: {
                            jardas_retornadas: (estatisticasAtuais.retorno?.jardas_retornadas || 0) + estatisticasEstruturadas.retorno.jardas_retornadas,
                            retornos: (estatisticasAtuais.retorno?.retornos || 0) + estatisticasEstruturadas.retorno.retornos,
                            td_retornados: (estatisticasAtuais.retorno?.td_retornados || 0) + estatisticasEstruturadas.retorno.td_retornados
                        },
                        defesa: {
                            tackles_totais: (estatisticasAtuais.defesa?.tackles_totais || 0) + estatisticasEstruturadas.defesa.tackles_totais,
                            tackles_for_loss: (estatisticasAtuais.defesa?.tackles_for_loss || 0) + estatisticasEstruturadas.defesa.tackles_for_loss,
                            sacks_forcado: (estatisticasAtuais.defesa?.sacks_forcado || 0) + estatisticasEstruturadas.defesa.sacks_forcado,
                            fumble_forcado: (estatisticasAtuais.defesa?.fumble_forcado || 0) + estatisticasEstruturadas.defesa.fumble_forcado,
                            interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasEstruturadas.defesa.interceptacao_forcada,
                            passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasEstruturadas.defesa.passe_desviado,
                            safety: (estatisticasAtuais.defesa?.safety || 0) + estatisticasEstruturadas.defesa.safety,
                            td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasEstruturadas.defesa.td_defensivo
                        },
                        kicker: {
                            xp_bons: (estatisticasAtuais.kicker?.xp_bons || 0) + estatisticasEstruturadas.kicker.xp_bons,
                            tentativas_de_xp: (estatisticasAtuais.kicker?.tentativas_de_xp || 0) + estatisticasEstruturadas.kicker.tentativas_de_xp,
                            fg_bons: (estatisticasAtuais.kicker?.fg_bons || 0) + estatisticasEstruturadas.kicker.fg_bons,
                            tentativas_de_fg: (estatisticasAtuais.kicker?.tentativas_de_fg || 0) + estatisticasEstruturadas.kicker.tentativas_de_fg,
                            fg_mais_longo: Math.max((estatisticasAtuais.kicker?.fg_mais_longo || 0), estatisticasEstruturadas.kicker.fg_mais_longo)
                        },
                        punter: {
                            punts: (estatisticasAtuais.punter?.punts || 0) + estatisticasEstruturadas.punter.punts,
                            jardas_de_punt: (estatisticasAtuais.punter?.jardas_de_punt || 0) + estatisticasEstruturadas.punter.jardas_de_punt
                        }
                    };

                    await prisma.jogadorTime.update({
                        where: { id: jogadorTime.id },
                        data: {
                            estatisticas: estatisticasConsolidadas
                        }
                    });

                    resultados.sucessoConsolidado++;
                    console.log(`✅ [CONSOLIDADO] ${jogador.nome} - Total acumulado`);

                } catch (error) {
                    console.error(`❌ [CONSOLIDADO] Erro para ${jogador.nome}:`, error);
                    resultados.erros.push({
                        jogador: jogador.nome,
                        tipo: 'consolidado',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }

                resultados.sucesso++;

            } catch (error) {
                resultados.erros.push({
                    linha: JSON.stringify(stat),
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
                console.error('❌ Erro ao processar estatística:', error);
            }
        }

        console.log('\n📊 RELATÓRIO DA DUPLA INSERÇÃO:');
        console.log(`✅ Total processado: ${resultados.sucesso}`);
        console.log(`📝 Jogo a jogo: ${resultados.sucessoJogoAJogo}`);
        console.log(`🔄 Consolidado: ${resultados.sucessoConsolidado}`);
        console.log(`❌ Erros: ${resultados.erros.length}`);

        res.json({
            message: 'Estatísticas importadas com dupla inserção',
            tipo: 'dupla_insercao',
            detalhes: resultados,
            arquivo: req.file.originalname
        });

    } catch (error) {
        console.error('❌ Erro na importação de estatísticas:', error);
        res.status(500).json({
            error: 'Erro ao importar estatísticas',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.get('/campeonatos/estatisticas', async (req, res) => {
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2025'

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
            temporada = '2025',
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
                    isSuperliga: true
                }
            })

            if (campeonato) {
                where.campeonatoId = campeonato.id
            } else {
                res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
                return
            }
        }

        if (status) where.status = status as string
        if (fase) where.fase = fase as string
        if (rodada) where.rodada = parseInt(rodada as string)

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

        let jogosFiltrados = jogos
        if (conferencia) {
            const timesConferencia = await prisma.time.findMany({
                where: {
                    temporada: temporada as string,
                }
            })

            const idsTimesConferencia = timesConferencia.map(t => t.id)
            jogosFiltrados = jogos.filter(jogo =>
                (jogo.timeCasaId && idsTimesConferencia.includes(jogo.timeCasaId)) ||
                (jogo.timeVisitanteId && idsTimesConferencia.includes(jogo.timeVisitanteId))
            )
        }

        res.json(jogosFiltrados)
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

        const campeonato = await prisma.campeonato.findFirst({
            where: {
                temporada: temporada,
                isSuperliga: true
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

        const times = await prisma.time.findMany({
            where: { temporada: '2025' },
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

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true },
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
        const playoffsFinalizados = playoffStats.find(s => s.status === 'FINALIZADO')?._count.id || 0

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
                times: 32
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
            acoes: {
                podeGerarPlayoffs: (jogosStats.find(s => s.status === 'FINALIZADO')?._count.id || 0) === 64,
                podeGerarFaseNacional: playoffsFinalizados >= 16
            }
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
                temporada: '2025'
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

        await prisma.materia.deleteMany()
        console.log('   ✅ Materia limpa')

        console.log('🔄 Resetando sequences...')

        try {
            await prisma.$executeRaw`ALTER SEQUENCE "Time_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1`
            await prisma.$executeRaw`ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1`
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
            prisma.campeonato.count(),
            prisma.jogo.count()
        ])

        console.log('📊 Verificação final:')
        console.log(`   Times: ${counts[0]}`)
        console.log(`   Jogadores: ${counts[1]}`)
        console.log(`   Campeonatos: ${counts[2]}`)
        console.log(`   Jogos: ${counts[3]}`)

        res.json({
            message: 'Banco de dados resetado com sucesso',
            detalhes: {
                tabelas_limpas: 10,
                sequences_resetadas: 10,
                verificacao: {
                    times: counts[0],
                    jogadores: counts[1],
                    campeonatos: counts[2],
                    jogos: counts[3]
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

adminRouter.put('/jogos/:id/gerenciar', async (req, res) => {
    try {
        const { id } = req.params
        const {
            placarCasa,
            placarVisitante,
            dataJogo,
            local,
            observacoes,
            status
        } = req.body

        console.log(`Atualizando jogo ${id} com dados:`, req.body)

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

        const dadosAtualizacao: any = {}

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

export default adminRouter