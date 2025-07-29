import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx'
import multer from 'multer'
import { calcularClassificacaoPorConferencia } from '../utils/distribuicaoUtils';

const prisma = new PrismaClient()

export const adminRouter = express.Router()

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

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

adminRouter.post('/iniciar-temporada/:ano', async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
        try {
            const { ano } = req.params;
            const anoAnterior = (parseInt(ano) - 1).toString();

            interface TimeChange {
                timeId: number;
                nome?: string;
                sigla?: string;
                cor?: string;
                instagram?: string;
                instagram2?: string;
                logo?: string;
                capacete?: string;
                presidente?: string;
                head_coach?: string;
                instagram_coach?: string
                coord_ofen?: string;
                coord_defen?: string;
            }

            interface Transferencia {
                jogadorId: number;
                jogadorNome?: string;
                timeOrigemId?: number;
                timeOrigemNome?: string;
                novoTimeId: number;
                novoTimeNome?: string;
                novaPosicao?: string;
                novoSetor?: string;
                novoNumero?: number;
                novaCamisa?: string;
            }

            const timesAnoAnterior = await tx.time.findMany({
                where: { temporada: anoAnterior },
            });

            if (timesAnoAnterior.length === 0) {
                throw new Error(`Nenhum time encontrado na temporada ${anoAnterior}`);
            }

            const mapeamentoIds = new Map();
            const mapeamentoNomes = new Map();

            const timesNovos = [];
            for (const time of timesAnoAnterior) {
                const timeId = time.id;
                const nomeAntigo = time.nome;

                const timeChanges: TimeChange[] = req.body.timeChanges || [];
                const timeChange = timeChanges.find((tc: TimeChange) => tc.timeId === timeId);

                const nomeNovo = timeChange?.nome || time.nome;

                const novoTime = await tx.time.create({
                    data: {
                        nome: nomeNovo,
                        sigla: timeChange?.sigla || time.sigla,
                        cor: timeChange?.cor || time.cor,
                        cidade: time.cidade,
                        bandeira_estado: time.bandeira_estado,
                        fundacao: time.fundacao,
                        logo: timeChange?.logo || time.logo,
                        capacete: timeChange?.capacete || time.capacete,
                        instagram: timeChange?.instagram || time.instagram,
                        instagram2: timeChange?.instagram2 || time.instagram2,
                        estadio: time.estadio,
                        presidente: timeChange?.presidente || time.presidente,
                        head_coach: timeChange?.head_coach || time.head_coach,
                        instagram_coach: time.instagram_coach,
                        coord_ofen: timeChange?.coord_ofen || time.coord_ofen,
                        coord_defen: timeChange?.coord_defen || time.coord_defen,
                        titulos: time.titulos as any,
                        temporada: ano,
                    },
                });

                mapeamentoIds.set(timeId, novoTime.id);

                if (nomeAntigo !== nomeNovo) {
                    mapeamentoNomes.set(nomeAntigo, {
                        novoNome: nomeNovo,
                        novoId: novoTime.id
                    });
                }

                timesNovos.push(novoTime);
            }

            const jogadoresTimesAnoAnterior = await tx.jogadorTime.findMany({
                where: { temporada: anoAnterior },
                include: { jogador: true, time: true },
            });

            const jogadoresProcessados = new Set<number>();

            const transferencias = req.body.transferencias || [];

            for (const transferencia of transferencias) {
                try {
                    const jogadorId = transferencia.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const jogador = await tx.jogador.findUnique({
                        where: { id: jogadorId }
                    });

                    if (!jogador) {
                        continue;
                    }

                    const relacaoAtual = await tx.jogadorTime.findFirst({
                        where: {
                            jogadorId: jogadorId,
                            temporada: anoAnterior
                        },
                        include: { time: true }
                    });

                    if (!relacaoAtual) {
                        continue;
                    }

                    let timeDestino = null;

                    if (transferencia.novoTimeId) {
                        const novoId = mapeamentoIds.get(transferencia.novoTimeId);
                        if (novoId) {
                            timeDestino = await tx.time.findUnique({
                                where: { id: novoId }
                            });
                        }
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        timeDestino = await tx.time.findFirst({
                            where: {
                                nome: transferencia.novoTimeNome,
                                temporada: ano
                            }
                        });

                        if (timeDestino) {
                        }
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        for (const [antigo, info] of mapeamentoNomes.entries()) {
                            if (info.novoNome === transferencia.novoTimeNome) {
                                timeDestino = await tx.time.findUnique({
                                    where: { id: info.novoId }
                                });
                                if (timeDestino) {
                                    break;
                                }
                            }
                        }
                    }

                    if (!timeDestino) {
                        continue;
                    }

                    if (transferencia.novaPosicao || transferencia.novoSetor) {
                        const dadosAtualizacao: { posicao?: string, setor?: string } = {};

                        if (transferencia.novaPosicao) dadosAtualizacao.posicao = transferencia.novaPosicao;
                        if (transferencia.novoSetor) dadosAtualizacao.setor = transferencia.novoSetor;

                        await tx.jogador.update({
                            where: { id: jogadorId },
                            data: dadosAtualizacao
                        });
                    }

                    const novoVinculo = await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: timeDestino.id,
                            temporada: ano,
                            numero: transferencia.novoNumero || relacaoAtual.numero,
                            camisa: transferencia.novaCamisa || relacaoAtual.camisa,
                            estatisticas: {}
                        }
                    });

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar transferência:`, error);
                }
            }

            let jogadoresRegularesProcessados = 0;

            for (const jt of jogadoresTimesAnoAnterior) {
                try {
                    const jogadorId = jt.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const timeOriginalId = jt.timeId;
                    const novoTimeId = mapeamentoIds.get(timeOriginalId);

                    if (!novoTimeId) {
                        console.error(`Não foi encontrado novo ID para o time original ${timeOriginalId}`);
                        continue;
                    }

                    await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: novoTimeId,
                            temporada: ano,
                            numero: jt.numero,
                            camisa: jt.camisa,
                            estatisticas: {}
                        }
                    });

                    jogadoresRegularesProcessados++;

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar jogador regular:`, error);
                }
            }

            const saveTransferenciasToJson = async (
                transferencias: Transferencia[],
                anoOrigem: string,
                anoDestino: string
            ): Promise<number> => {
                try {
                    const dirPath = path.join(process.cwd(), 'public', 'data');

                    if (!fs.existsSync(dirPath)) {
                        console.log(`Criando diretório: ${dirPath}`);
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    const transferenciasFormatadas = [];

                    for (const transferencia of transferencias) {
                        const jogador = await prisma.jogador.findUnique({
                            where: { id: transferencia.jogadorId }
                        });

                        const timeOrigem = transferencia.timeOrigemId ?
                            await prisma.time.findUnique({ where: { id: transferencia.timeOrigemId } }) :
                            null;

                        const timeDestino = await prisma.time.findUnique({
                            where: { id: transferencia.novoTimeId }
                        });

                        transferenciasFormatadas.push({
                            id: transferencia.jogadorId,
                            jogadorNome: jogador?.nome || transferencia.jogadorNome,
                            timeOrigemId: transferencia.timeOrigemId,
                            timeOrigemNome: timeOrigem?.nome || '',
                            timeOrigemSigla: timeOrigem?.sigla || '',
                            timeDestinoId: transferencia.novoTimeId,
                            timeDestinoNome: timeDestino?.nome || transferencia.novoTimeNome,
                            timeDestinoSigla: timeDestino?.sigla || '',
                            novaPosicao: transferencia.novaPosicao || null,
                            novoSetor: transferencia.novoSetor || null,
                            novoNumero: transferencia.novoNumero || null,
                            novaCamisa: transferencia.novaCamisa || null,
                            data: new Date().toISOString()
                        });
                    }

                    const filePath = path.join(dirPath, `transferencias_${anoOrigem}_${anoDestino}.json`);
                    console.log(`Salvando transferências em: ${filePath}`);

                    fs.writeFileSync(filePath, JSON.stringify(transferenciasFormatadas, null, 2));
                    console.log(`${transferenciasFormatadas.length} transferências salvas com sucesso em ${filePath}`);
                    return transferenciasFormatadas.length;
                } catch (error) {
                    console.error('Erro ao salvar transferências em JSON:', error);
                    return 0;
                }
            };

            const totalSalvo = await saveTransferenciasToJson(transferencias, anoAnterior, ano);
            console.log(`Total de ${totalSalvo} transferências salvas em JSON`);
            const jogadoresNovaTemporada = await tx.jogadorTime.count({
                where: { temporada: ano }
            });

            console.log(`Contagem final: ${jogadoresNovaTemporada} jogadores na temporada ${ano}`);

            return {
                message: `Temporada ${ano} iniciada com sucesso!`,
                times: 0,
                jogadores: 0,
                transferencias: totalSalvo
            };

        } catch (error) {
            console.error(`Erro ao iniciar temporada:`, error);
            throw error;
        }
    }, {
        timeout: 120000,
    });

    res.status(200).json(result);
});

adminRouter.post('/importar-times', upload.single('arquivo'), async (req, res) => {
    console.log('Rota /importar-times chamada')
    try {
        if (!req.file) {
            console.log('Nenhum arquivo enviado');
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        const workbook = xlsx.readFile(req.file.path);
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

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

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

        const workbook = xlsx.readFile(req.file.path)
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

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path)
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

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path)
        }

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

        console.log(`Arquivo recebido: ${req.file.path}`)

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

        const timesDistribuidos = await prisma.distribuicaoTime.count({
            where: {
                campeonatoId: superliga.id,
                temporada: '2025'
            }
        })

        console.log(`🎯 Verificação: ${timesDistribuidos} times distribuídos para a Superliga`)

        if (timesDistribuidos === 0) {
            res.status(400).json({
                error: 'Execute o script de distribuição dos times antes de importar a agenda',
                detalhes: 'Nenhum time foi encontrado na distribuição das conferências'
            })
            return
        }

        if (timesDistribuidos < 32) {
            console.log(`⚠️  Aviso: Apenas ${timesDistribuidos}/32 times distribuídos, mas prosseguindo...`)
        }

        const workbook = xlsx.readFile(req.file.path)
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

        const mapaTimes = new Map<string, typeof times[0]>()
        times.forEach(time => {
            mapaTimes.set(time.nome.toLowerCase().trim(), time)
            mapaTimes.set(time.sigla.toLowerCase().trim(), time)
        })

        console.log(`🗺️  Mapa criado com ${mapaTimes.size} entradas para ${times.length} times`)

        const distribuicao = await prisma.distribuicaoTime.findMany({
            where: { campeonatoId: superliga.id },
            include: {
                conferencia: { select: { nome: true, tipo: true } },
                regional: { select: { nome: true, tipo: true } }
            }
        })

        const mapaDistribuicao = new Map<number, any>()
        distribuicao.forEach(dist => {
            mapaDistribuicao.set(dist.timeId, {
                conferencia: dist.conferenciaType,
                regional: dist.regionalType,
                conferenciaObj: dist.conferencia,
                regionalObj: dist.regional
            })
        })

        const resultados = {
            jogosTemporadaRegular: 0,
            jogosPlayoffMock: 0,
            erros: [] as any[],
            warnings: [] as any[]
        }

        for (let i = 0; i < jogosRaw.length; i++) {
            const jogoData = jogosRaw[i] as any
            const linha = i + 2

            try {
                // ✅ EXTRAIR NOMES DOS TIMES
                const nomeTimeCasa = jogoData.time_mandante?.toString().trim() || jogoData.time_casa?.toString().trim()
                const nomeTimeVisitante = jogoData.time_visitante?.toString().trim()

                // ✅ DETECTAR SE É JOGO DE PLAYOFF (campos vazios)
                const isJogoPlayoff = !nomeTimeCasa || !nomeTimeVisitante ||
                    nomeTimeCasa === '' || nomeTimeVisitante === '' ||
                    nomeTimeCasa === 'undefined' || nomeTimeVisitante === 'undefined' ||
                    nomeTimeCasa.includes('A definir') || nomeTimeVisitante.includes('A definir') ||
                    nomeTimeCasa.includes('TBD') || nomeTimeVisitante.includes('TBD')

                let timeCasa, timeVisitante

                if (isJogoPlayoff) {
                    // ✅ JOGO DE PLAYOFF - CRIAR MOCK VARIADO
                    const timesArray = Array.from(mapaTimes.values())

                    if (timesArray.length < 2) {
                        resultados.erros.push({
                            linha,
                            erro: 'Não há times suficientes para criar mock de playoff'
                        })
                        continue
                    }

                    // Criar combinações diferentes para cada jogo
                    const jogoIndex = linha - 65 // Primeiro playoff é linha 65
                    const indexCasa = (jogoIndex * 3) % timesArray.length
                    let indexVisitante = (jogoIndex * 3 + 7) % timesArray.length

                    // Garantir que não seja o mesmo time
                    if (indexCasa === indexVisitante) {
                        indexVisitante = (indexVisitante + 1) % timesArray.length
                    }

                    timeCasa = timesArray[indexCasa]
                    timeVisitante = timesArray[indexVisitante]

                    console.log(`🏈 Playoff mock criado: linha ${linha} - ${timeCasa.nome} vs ${timeVisitante.nome} (temporário)`)
                } else {
                    // ✅ JOGO DE TEMPORADA REGULAR - BUSCAR TIMES REAIS
                    timeCasa = mapaTimes.get(nomeTimeCasa.toLowerCase().trim())
                    if (!timeCasa) {
                        resultados.erros.push({
                            linha,
                            jogo: `${nomeTimeCasa} vs ${nomeTimeVisitante}`,
                            erro: `Time mandante "${nomeTimeCasa}" não encontrado`
                        })
                        continue
                    }

                    timeVisitante = mapaTimes.get(nomeTimeVisitante.toLowerCase().trim())
                    if (!timeVisitante) {
                        resultados.erros.push({
                            linha,
                            jogo: `${nomeTimeCasa} vs ${nomeTimeVisitante}`,
                            erro: `Time visitante "${nomeTimeVisitante}" não encontrado`
                        })
                        continue
                    }
                }

                // ✅ PROCESSAR DATA DO JOGO
                let dataJogo: Date
                try {
                    if (typeof jogoData.data === 'number') {
                        dataJogo = new Date((jogoData.data - 25569) * 86400 * 1000)
                    } else {
                        dataJogo = new Date(jogoData.data)
                    }

                    if (isNaN(dataJogo.getTime())) {
                        throw new Error('Data inválida')
                    }
                } catch {
                    resultados.erros.push({
                        linha,
                        erro: `Data inválida: ${jogoData.data || 'Data não informada'}`
                    })
                    continue
                }

                // ✅ OBTER CONTEXTO REGIONAL (só para temporada regular)
                let conferenciaJogo = null
                let regionalJogo = null

                if (!isJogoPlayoff) {
                    const distCasa = mapaDistribuicao.get(timeCasa.id)
                    conferenciaJogo = jogoData.conferencia || distCasa?.conferencia || 'Geral'
                    regionalJogo = jogoData.regional || distCasa?.regional || null
                }

                // ✅ CRIAR JOGO
                const novoJogo = await prisma.jogo.create({
                    data: {
                        campeonatoId: superliga.id,
                        timeCasaId: timeCasa.id,
                        timeVisitanteId: timeVisitante.id,
                        dataJogo: dataJogo,
                        local: jogoData.local || jogoData.estadio || (isJogoPlayoff ? 'A definir' : (timeCasa?.nome || 'Local não definido')),
                        rodada: parseInt(jogoData.rodada?.toString() || '1'),
                        fase: jogoData.fase || 'TEMPORADA REGULAR',
                        status: 'AGENDADO',
                        // ✅ MARCAR JOGOS MOCK
                        observacoes: isJogoPlayoff
                            ? 'MOCK - Times serão definidos após temporada regular'
                            : (jogoData.observacoes || null),
                        conferencia: conferenciaJogo,
                        regional: regionalJogo,
                        temporada: '2025'
                    }
                })

                // ✅ CONTABILIZAR RESULTADOS
                if (isJogoPlayoff) {
                    resultados.jogosPlayoffMock++
                } else {
                    resultados.jogosTemporadaRegular++
                }

                // ✅ LOG DE PROGRESSO
                if (i % 10 === 0) {
                    console.log(`📊 Processando: ${i + 1}/${jogosRaw.length}`)
                }

            } catch (error) {
                resultados.erros.push({
                    linha,
                    erro: `Erro interno: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
                })
                console.error(`❌ Erro na linha ${linha}:`, error)
            }
        }

        // ✅ LIMPAR ARQUIVO TEMPORÁRIO
        try {
            fs.unlinkSync(req.file.path)
        } catch (cleanupError) {
            console.warn('⚠️  Não foi possível remover arquivo temporário:', cleanupError)
        }

        // ✅ RESPOSTA FINAL
        const totalJogos = resultados.jogosTemporadaRegular + resultados.jogosPlayoffMock

        const resposta = {
            message: `Agenda importada com sucesso!`,
            resumo: {
                totalJogos,
                jogosTemporadaRegular: resultados.jogosTemporadaRegular,
                jogosPlayoffs: resultados.jogosPlayoffMock,
                jogosComErro: resultados.erros.length
            },
            detalhes: {
                totalLinhas: jogosRaw.length,
                erros: resultados.erros.length > 0 ? resultados.erros : undefined,
                warnings: resultados.warnings.length > 0 ? resultados.warnings : undefined
            },
            proximaEtapa: 'Agora você pode importar os resultados dos jogos conforme eles acontecem'
        }

        console.log('✅ Importação da agenda finalizada:')
        console.log(`   📊 Jogos temporada regular: ${resultados.jogosTemporadaRegular}`)
        console.log(`   🏈 Jogos playoff (mock): ${resultados.jogosPlayoffMock}`)
        console.log(`   📋 Total de jogos: ${totalJogos}`)
        console.log(`   ❌ Erros: ${resultados.erros.length}`)

        res.status(200).json(resposta)

    } catch (error) {
        console.error('❌ Erro na importação da agenda:', error)

        // Limpar arquivo em caso de erro
        if (req.file?.path) {
            try {
                fs.unlinkSync(req.file.path)
            } catch { }
        }

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

        // ✅ INSERIR ESTA VALIDAÇÃO AQUI (ANTES DO console.log e workbook)
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

        // ✅ VALIDAÇÃO CRÍTICA: Só permitir estatísticas para jogos FINALIZADOS
        if (jogo.status !== 'FINALIZADO') {
            console.error(`❌ Tentativa de inserir estatísticas para jogo ${id_jogo} com status: ${jogo.status}`);
            console.error(`   Jogo: ${jogo.timeCasa.nome} vs ${jogo.timeVisitante.nome}`);

            res.status(400).json({
                error: `Não é possível inserir estatísticas para jogo com status: ${jogo.status}`,
                detalhes: {
                    jogoId: id_jogo,
                    status: jogo.status,
                    confronto: `${jogo.timeCasa.nome} vs ${jogo.timeVisitante.nome}`,
                    data: jogo.dataJogo,
                    statusPermitido: 'FINALIZADO'
                }
            });
            return;
        }

        console.log(`✅ Jogo ${id_jogo} validado para inserção de estatísticas`);
        console.log(`   Status: ${jogo.status}`);
        console.log(`   Confronto: ${jogo.timeCasa.sigla} vs ${jogo.timeVisitante.sigla}`);
        // ✅ FIM DA VALIDAÇÃO

        console.log('📊 INICIANDO DUPLA INSERÇÃO DE ESTATÍSTICAS...');
        console.log(`🎯 Jogo: ${id_jogo}, Data: ${data_jogo}`);

        const workbook = xlsx.readFile(req.file.path);
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
                            campeonatoId: superliga.id, // ✅ ADICIONAR ESTA LINHA
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

adminRouter.post('/reprocessar-jogo', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const { id_jogo, data_jogo, force } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }


        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`Reprocessando estatísticas de ${estatisticasJogo.length} jogadores para o jogo ${id_jogo}`);

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };


        let estatisticasAnteriores: Array<{
            jogadorId: number;
            timeId: number;
            temporada: string;
            estatisticas: any;
        }> = [];



        await prisma.$transaction(async (tx) => {

            if (estatisticasAnteriores.length > 0) {
                console.log(`Revertendo estatísticas anteriores do jogo ${id_jogo}`);

                for (const estatAnterior of estatisticasAnteriores) {
                    try {
                        const jogador = await tx.jogador.findUnique({
                            where: { id: estatAnterior.jogadorId },
                            include: {
                                times: {
                                    where: {
                                        temporada: estatAnterior.temporada,
                                        timeId: estatAnterior.timeId
                                    }
                                }
                            }
                        });

                        if (!jogador || !jogador.times || jogador.times.length === 0) {
                            console.warn(`Jogador ${estatAnterior.jogadorId} não encontrado para reverter estatísticas`);
                            continue;
                        }

                        const jogadorTime = jogador.times[0];
                        const estatisticasAtuais = jogadorTime.estatisticas as any;
                        const novasEstatisticas = {
                            passe: {
                                passes_completos: Math.max(0, (estatisticasAtuais.passe?.passes_completos || 0) - (estatAnterior.estatisticas.passe?.passes_completos || 0)),
                                passes_tentados: Math.max(0, (estatisticasAtuais.passe?.passes_tentados || 0) - (estatAnterior.estatisticas.passe?.passes_tentados || 0)),
                                jardas_de_passe: Math.max(0, (estatisticasAtuais.passe?.jardas_de_passe || 0) - (estatAnterior.estatisticas.passe?.jardas_de_passe || 0)),
                                td_passados: Math.max(0, (estatisticasAtuais.passe?.td_passados || 0) - (estatAnterior.estatisticas.passe?.td_passados || 0)),
                                interceptacoes_sofridas: Math.max(0, (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) - (estatAnterior.estatisticas.passe?.interceptacoes_sofridas || 0)),
                                sacks_sofridos: Math.max(0, (estatisticasAtuais.passe?.sacks_sofridos || 0) - (estatAnterior.estatisticas.passe?.sacks_sofridos || 0)),
                                fumble_de_passador: Math.max(0, (estatisticasAtuais.passe?.fumble_de_passador || 0) - (estatAnterior.estatisticas.passe?.fumble_de_passador || 0))
                            },
                            corrida: {
                                corridas: Math.max(0, (estatisticasAtuais.corrida?.corridas || 0) - (estatAnterior.estatisticas.corrida?.corridas || 0)),
                                jardas_corridas: Math.max(0, (estatisticasAtuais.corrida?.jardas_corridas || 0) - (estatAnterior.estatisticas.corrida?.jardas_corridas || 0)),
                                tds_corridos: Math.max(0, (estatisticasAtuais.corrida?.tds_corridos || 0) - (estatAnterior.estatisticas.corrida?.tds_corridos || 0)),
                                fumble_de_corredor: Math.max(0, (estatisticasAtuais.corrida?.fumble_de_corredor || 0) - (estatAnterior.estatisticas.corrida?.fumble_de_corredor || 0))
                            },
                            recepcao: {
                                recepcoes: Math.max(0, (estatisticasAtuais.recepcao?.recepcoes || 0) - (estatAnterior.estatisticas.recepcao?.recepcoes || 0)),
                                alvo: Math.max(0, (estatisticasAtuais.recepcao?.alvo || 0) - (estatAnterior.estatisticas.recepcao?.alvo || 0)),
                                jardas_recebidas: Math.max(0, (estatisticasAtuais.recepcao?.jardas_recebidas || 0) - (estatAnterior.estatisticas.recepcao?.jardas_recebidas || 0)),
                                tds_recebidos: Math.max(0, (estatisticasAtuais.recepcao?.tds_recebidos || 0) - (estatAnterior.estatisticas.recepcao?.tds_recebidos || 0))
                            },
                            retorno: {
                                retornos: Math.max(0, (estatisticasAtuais.retorno?.retornos || 0) - (estatAnterior.estatisticas.retorno?.retornos || 0)),
                                jardas_retornadas: Math.max(0, (estatisticasAtuais.retorno?.jardas_retornadas || 0) - (estatAnterior.estatisticas.retorno?.jardas_retornadas || 0)),
                                td_retornados: Math.max(0, (estatisticasAtuais.retorno?.td_retornados || 0) - (estatAnterior.estatisticas.retorno?.td_retornados || 0))
                            },
                            defesa: {
                                tackles_totais: Math.max(0, (estatisticasAtuais.defesa?.tackles_totais || 0) - (estatAnterior.estatisticas.defesa?.tackles_totais || 0)),
                                tackles_for_loss: Math.max(0, (estatisticasAtuais.defesa?.tackles_for_loss || 0) - (estatAnterior.estatisticas.defesa?.tackles_for_loss || 0)),
                                sacks_forcado: Math.max(0, (estatisticasAtuais.defesa?.sacks_forcado || 0) - (estatAnterior.estatisticas.defesa?.sacks_forcado || 0)),
                                fumble_forcado: Math.max(0, (estatisticasAtuais.defesa?.fumble_forcado || 0) - (estatAnterior.estatisticas.defesa?.fumble_forcado || 0)),
                                interceptacao_forcada: Math.max(0, (estatisticasAtuais.defesa?.interceptacao_forcada || 0) - (estatAnterior.estatisticas.defesa?.interceptacao_forcada || 0)),
                                passe_desviado: Math.max(0, (estatisticasAtuais.defesa?.passe_desviado || 0) - (estatAnterior.estatisticas.defesa?.passe_desviado || 0)),
                                safety: Math.max(0, (estatisticasAtuais.defesa?.safety || 0) - (estatAnterior.estatisticas.defesa?.safety || 0)),
                                td_defensivo: Math.max(0, (estatisticasAtuais.defesa?.td_defensivo || 0) - (estatAnterior.estatisticas.defesa?.td_defensivo || 0))
                            },
                            kicker: {
                                xp_bons: Math.max(0, (estatisticasAtuais.kicker?.xp_bons || 0) - (estatAnterior.estatisticas.kicker?.xp_bons || 0)),
                                tentativas_de_xp: Math.max(0, (estatisticasAtuais.kicker?.tentativas_de_xp || 0) - (estatAnterior.estatisticas.kicker?.tentativas_de_xp || 0)),
                                fg_bons: Math.max(0, (estatisticasAtuais.kicker?.fg_bons || 0) - (estatAnterior.estatisticas.kicker?.fg_bons || 0)),
                                tentativas_de_fg: Math.max(0, (estatisticasAtuais.kicker?.tentativas_de_fg || 0) - (estatAnterior.estatisticas.kicker?.tentativas_de_fg || 0)),
                                fg_mais_longo: estatisticasAtuais.kicker?.fg_mais_longo || 0
                            },
                            punter: {
                                punts: Math.max(0, (estatisticasAtuais.punter?.punts || 0) - (estatAnterior.estatisticas.punter?.punts || 0)),
                                jardas_de_punt: Math.max(0, (estatisticasAtuais.punter?.jardas_de_punt || 0) - (estatAnterior.estatisticas.punter?.jardas_de_punt || 0))
                            }
                        };

                        await tx.jogadorTime.update({
                            where: { id: jogadorTime.id },
                            data: {
                                estatisticas: novasEstatisticas
                            }
                        });

                    } catch (error) {
                        console.error(`Erro ao reverter estatísticas para jogador ${estatAnterior.jogadorId}:`, error);
                    }
                }
            }

            const novasEstatisticasJogo: Array<{
                jogadorId: number;
                timeId: number;
                temporada: string;
                estatisticas: any;
            }> = [];

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
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada: temporada },
                                    include: { time: true }
                                }
                            }
                        });
                    }

                    if (!jogador || !jogador.times || jogador.times.length === 0) {
                        resultados.erros.push({
                            jogador: stat.jogador_nome || stat.jogador_id,
                            erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                        });
                        continue;
                    }

                    const jogadorTime = jogador.times[0];
                    const estatisticasAtuais = jogadorTime.estatisticas as any;

                    const estatisticasDoJogo = {
                        passe: {
                            passes_completos: parseInt(stat.passes_completos) || 0,
                            passes_tentados: parseInt(stat.passes_tentados) || 0,
                            jardas_de_passe: parseInt(stat.jardas_de_passe) || 0,
                            td_passados: parseInt(stat.td_passados) || 0,
                            interceptacoes_sofridas: parseInt(stat.interceptacoes_sofridas) || 0,
                            sacks_sofridos: parseInt(stat.sacks_sofridos) || 0,
                            fumble_de_passador: parseInt(stat.fumble_de_passador) || 0
                        },
                        corrida: {
                            corridas: parseInt(stat.corridas) || 0,
                            jardas_corridas: parseInt(stat.jardas_corridas) || 0,
                            tds_corridos: parseInt(stat.tds_corridos) || 0,
                            fumble_de_corredor: parseInt(stat.fumble_de_corredor) || 0
                        },
                        recepcao: {
                            recepcoes: parseInt(stat.recepcoes) || 0,
                            alvo: parseInt(stat.alvo) || 0,
                            jardas_recebidas: parseInt(stat.jardas_recebidas) || 0,
                            tds_recebidos: parseInt(stat.tds_recebidos) || 0
                        },
                        retorno: {
                            retornos: parseInt(stat.retornos) || 0,
                            jardas_retornadas: parseInt(stat.jardas_retornadas) || 0,
                            td_retornados: parseInt(stat.td_retornados) || 0
                        },
                        defesa: {
                            tackles_totais: parseInt(stat.tackles_totais) || 0,
                            tackles_for_loss: parseInt(stat.tackles_for_loss) || 0,
                            sacks_forcado: parseInt(stat.sacks_forcado) || 0,
                            fumble_forcado: parseInt(stat.fumble_forcado) || 0,
                            interceptacao_forcada: parseInt(stat.interceptacao_forcada) || 0,
                            passe_desviado: parseInt(stat.passe_desviado) || 0,
                            safety: parseInt(stat.safety) || 0,
                            td_defensivo: parseInt(stat.td_defensivo) || 0
                        },
                        kicker: {
                            xp_bons: parseInt(stat.xp_bons) || 0,
                            tentativas_de_xp: parseInt(stat.tentativas_de_xp) || 0,
                            fg_bons: parseInt(stat.fg_bons) || 0,
                            tentativas_de_fg: parseInt(stat.tentativas_de_fg) || 0,
                            fg_mais_longo: parseInt(stat.fg_mais_longo) || 0
                        },
                        punter: {
                            punts: parseInt(stat.punts) || 0,
                            jardas_de_punt: parseInt(stat.jardas_de_punt) || 0
                        }
                    };

                    novasEstatisticasJogo.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    const novasEstatisticasTotais = {
                        passe: {
                            passes_completos: (estatisticasAtuais.passe?.passes_completos || 0) + estatisticasDoJogo.passe.passes_completos,
                            passes_tentados: (estatisticasAtuais.passe?.passes_tentados || 0) + estatisticasDoJogo.passe.passes_tentados,
                            jardas_de_passe: (estatisticasAtuais.passe?.jardas_de_passe || 0) + estatisticasDoJogo.passe.jardas_de_passe,
                            td_passados: (estatisticasAtuais.passe?.td_passados || 0) + estatisticasDoJogo.passe.td_passados,
                            interceptacoes_sofridas: (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) + estatisticasDoJogo.passe.interceptacoes_sofridas,
                            sacks_sofridos: (estatisticasAtuais.passe?.sacks_sofridos || 0) + estatisticasDoJogo.passe.sacks_sofridos,
                            fumble_de_passador: (estatisticasAtuais.passe?.fumble_de_passador || 0) + estatisticasDoJogo.passe.fumble_de_passador
                        },
                        corrida: {
                            corridas: (estatisticasAtuais.corrida?.corridas || 0) + estatisticasDoJogo.corrida.corridas,
                            jardas_corridas: (estatisticasAtuais.corrida?.jardas_corridas || 0) + estatisticasDoJogo.corrida.jardas_corridas,
                            tds_corridos: (estatisticasAtuais.corrida?.tds_corridos || 0) + estatisticasDoJogo.corrida.tds_corridos,
                            fumble_de_corredor: (estatisticasAtuais.corrida?.fumble_de_corredor || 0) + estatisticasDoJogo.corrida.fumble_de_corredor
                        },
                        recepcao: {
                            recepcoes: (estatisticasAtuais.recepcao?.recepcoes || 0) + estatisticasDoJogo.recepcao.recepcoes,
                            alvo: (estatisticasAtuais.recepcao?.alvo || 0) + estatisticasDoJogo.recepcao.alvo,
                            jardas_recebidas: (estatisticasAtuais.recepcao?.jardas_recebidas || 0) + estatisticasDoJogo.recepcao.jardas_recebidas,
                            tds_recebidos: (estatisticasAtuais.recepcao?.tds_recebidos || 0) + estatisticasDoJogo.recepcao.tds_recebidos
                        },
                        retorno: {
                            retornos: (estatisticasAtuais.retorno?.retornos || 0) + estatisticasDoJogo.retorno.retornos,
                            jardas_retornadas: (estatisticasAtuais.retorno?.jardas_retornadas || 0) + estatisticasDoJogo.retorno.jardas_retornadas,
                            td_retornados: (estatisticasAtuais.retorno?.td_retornados || 0) + estatisticasDoJogo.retorno.td_retornados
                        },
                        defesa: {
                            tackles_totais: (estatisticasAtuais.defesa?.tackles_totais || 0) + estatisticasDoJogo.defesa.tackles_totais,
                            tackles_for_loss: (estatisticasAtuais.defesa?.tackles_for_loss || 0) + estatisticasDoJogo.defesa.tackles_for_loss,
                            sacks_forcado: (estatisticasAtuais.defesa?.sacks_forcado || 0) + estatisticasDoJogo.defesa.sacks_forcado,
                            fumble_forcado: (estatisticasAtuais.defesa?.fumble_forcado || 0) + estatisticasDoJogo.defesa.fumble_forcado,
                            interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasDoJogo.defesa.interceptacao_forcada,
                            passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasDoJogo.defesa.passe_desviado,
                            safety: (estatisticasAtuais.defesa?.safety || 0) + estatisticasDoJogo.defesa.safety,
                            td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasDoJogo.defesa.td_defensivo
                        },
                        kicker: {
                            xp_bons: (estatisticasAtuais.kicker?.xp_bons || 0) + estatisticasDoJogo.kicker.xp_bons,
                            tentativas_de_xp: (estatisticasAtuais.kicker?.tentativas_de_xp || 0) + estatisticasDoJogo.kicker.tentativas_de_xp,
                            fg_bons: (estatisticasAtuais.kicker?.fg_bons || 0) + estatisticasDoJogo.kicker.fg_bons,
                            tentativas_de_fg: (estatisticasAtuais.kicker?.tentativas_de_fg || 0) + estatisticasDoJogo.kicker.tentativas_de_fg,
                            fg_mais_longo: Math.max(estatisticasAtuais.kicker?.fg_mais_longo || 0, estatisticasDoJogo.kicker.fg_mais_longo)
                        },
                        punter: {
                            punts: (estatisticasAtuais.punter?.punts || 0) + estatisticasDoJogo.punter.punts,
                            jardas_de_punt: (estatisticasAtuais.punter?.jardas_de_punt || 0) + estatisticasDoJogo.punter.jardas_de_punt
                        }
                    };

                    await tx.jogadorTime.update({
                        where: { id: jogadorTime.id },
                        data: {
                            estatisticas: novasEstatisticasTotais
                        }
                    });

                    resultados.sucesso++;
                } catch (error) {
                    console.error(`Erro ao processar estatísticas para jogador:`, error);
                    resultados.erros.push({
                        jogador: stat.jogador_nome || stat.jogador_id || 'Desconhecido',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }
            }


        });

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} reprocessadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao reprocessar estatísticas do jogo:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao reprocessar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

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
                idsTimesConferencia.includes(jogo.timeCasaId) ||
                idsTimesConferencia.includes(jogo.timeVisitanteId)
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

        console.log(`Resultado atualizado: ${jogoAtualizado.timeCasa.nome} ${placarCasa} x ${placarVisitante} ${jogoAtualizado.timeVisitante.nome}`)

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
        console.log('Arquivo recebido:', req.file.path)

        const workbook = xlsx.readFile(req.file.path)
        const sheetName = workbook.SheetNames[0]
        const resultadosSheet = workbook.Sheets[sheetName]
        const resultadosRaw = xlsx.utils.sheet_to_json(resultadosSheet) as any[]

        const resultados = {
            sucesso: 0,
            erros: [] as any[],
            jogosPulados: 0
        }

        // ✅ PROCESSAMENTO ÚNICO PARA TODOS OS JOGOS (TEMPORADA REGULAR + PLAYOFFS)
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

                // ✅ VERIFICAR SE TIMES ESTÃO DEFINIDOS (não são TBD)
                if (jogo.timeCasa.nome.includes('TBD') || jogo.timeVisitante.nome.includes('TBD')) {
                    console.log(`⏭️  Pulando jogo ${jogoId} - Times ainda não definidos (TBD)`)
                    resultados.jogosPulados++
                    continue
                }

                const placarCasa = parseInt(resultado.placar_mandante)
                const placarVisitante = parseInt(resultado.placar_visitante)
                const statusPlanilha = resultado.status || 'FINALIZADO'

                // Validar placares para jogos finalizados
                if (statusPlanilha === 'FINALIZADO' && (isNaN(placarCasa) || isNaN(placarVisitante))) {
                    resultados.erros.push({
                        linha: jogoId,
                        erro: 'Para jogos finalizados, placares são obrigatórios'
                    })
                    continue
                }

                // ✅ DETERMINAR VENCEDOR (para playoffs)
                let timeVencedorId = null
                if (statusPlanilha === 'FINALIZADO' && jogo.fase !== 'TEMPORADA REGULAR') {
                    timeVencedorId = placarCasa > placarVisitante ? jogo.timeCasaId : jogo.timeVisitanteId
                }

                // ✅ ATUALIZAR JOGO (MESMO PROCESSO PARA TODOS)
                const updateData: any = {
                    status: statusPlanilha,
                    observacoes: resultado.observacoes || null
                }

                if (statusPlanilha === 'FINALIZADO') {
                    updateData.placarCasa = placarCasa
                    updateData.placarVisitante = placarVisitante
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

                // ✅ DEFINIR PRÓXIMOS JOGOS DE PLAYOFF (se necessário)
                if (statusPlanilha === 'FINALIZADO' && jogo.fase !== 'TEMPORADA REGULAR') {
                    await definirProximosJogosPlayoff(jogo, timeVencedorId!)
                }

            } catch (error) {
                resultados.erros.push({
                    linha: resultado.id_jogo,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                })
            }
        }

        // Verificar se temporada regular foi finalizada
        await verificarFinalizacaoTemporadaRegular()

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
        if (req.file?.path) {
            fs.unlinkSync(req.file.path)
        }
    }
})

// ✅ FUNÇÃO PARA DEFINIR PRÓXIMOS JOGOS DE PLAYOFF
async function definirProximosJogosPlayoff(jogoFinalizado: any, timeVencedorId: number) {
    try {
        const { fase, campeonatoId, conferenciaId } = jogoFinalizado

        console.log(`🔄 Definindo próximos jogos após ${fase}...`)

        switch (fase) {
            case 'WILD CARD':
                await definirSemifinaisConferencia(campeonatoId, conferenciaId, timeVencedorId)
                break

            case 'SEMIFINAL DE CONFERÊNCIA':
                await definirFinalConferencia(campeonatoId, conferenciaId, timeVencedorId)
                break

            case 'FINAL DE CONFERÊNCIA':
                await definirSemifinaisNacionais(campeonatoId, timeVencedorId)
                break

            case 'SEMIFINAL NACIONAL':
                await definirFinalNacional(campeonatoId, timeVencedorId)
                break
        }
    } catch (error) {
        console.error(`⚠️ Erro ao definir próximos jogos após ${jogoFinalizado.fase}:`, error)
    }
}

// ✅ FUNÇÕES AUXILIARES PARA DEFINIR PRÓXIMOS JOGOS
async function definirSemifinaisConferencia(campeonatoId: number, conferenciaId: number, vencedorId: number) {
    // Buscar próximo jogo de semifinal da mesma conferência que está com TBD
    const proximoJogo = await prisma.jogo.findFirst({
        where: {
            campeonatoId,
            conferenciaId,
            fase: 'SEMIFINAL DE CONFERÊNCIA',
            OR: [
                { timeCasa: { nome: { contains: 'TBD' } } },
                { timeVisitante: { nome: { contains: 'TBD' } } }
            ]
        },
        include: {
            timeCasa: true,
            timeVisitante: true
        }
    })

    if (proximoJogo) {
        if (proximoJogo.timeCasa.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeCasaId: vencedorId }
            })
        } else if (proximoJogo.timeVisitante.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeVisitanteId: vencedorId }
            })
        }
        console.log(`   ➡️  Time ${vencedorId} classificado para Semifinal de Conferência (Jogo ${proximoJogo.id})`)
    }
}

async function definirFinalConferencia(campeonatoId: number, conferenciaId: number, vencedorId: number) {
    const proximoJogo = await prisma.jogo.findFirst({
        where: {
            campeonatoId,
            conferenciaId,
            fase: 'FINAL DE CONFERÊNCIA',
            OR: [
                { timeCasa: { nome: { contains: 'TBD' } } },
                { timeVisitante: { nome: { contains: 'TBD' } } }
            ]
        },
        include: {
            timeCasa: true,
            timeVisitante: true
        }
    })

    if (proximoJogo) {
        if (proximoJogo.timeCasa.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeCasaId: vencedorId }
            })
        } else if (proximoJogo.timeVisitante.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeVisitanteId: vencedorId }
            })
        }
        console.log(`   ➡️  Time ${vencedorId} classificado para Final de Conferência (Jogo ${proximoJogo.id})`)
    }
}

async function definirSemifinaisNacionais(campeonatoId: number, vencedorId: number) {
    const proximoJogo = await prisma.jogo.findFirst({
        where: {
            campeonatoId,
            fase: 'SEMIFINAL NACIONAL',
            OR: [
                { timeCasa: { nome: { contains: 'TBD' } } },
                { timeVisitante: { nome: { contains: 'TBD' } } }
            ]
        },
        include: {
            timeCasa: true,
            timeVisitante: true
        }
    })

    if (proximoJogo) {
        if (proximoJogo.timeCasa.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeCasaId: vencedorId }
            })
        } else if (proximoJogo.timeVisitante.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeVisitanteId: vencedorId }
            })
        }
        console.log(`   ➡️  Time ${vencedorId} classificado para Semifinal Nacional (Jogo ${proximoJogo.id})`)
    }
}

async function definirFinalNacional(campeonatoId: number, vencedorId: number) {
    const proximoJogo = await prisma.jogo.findFirst({
        where: {
            campeonatoId,
            fase: 'FINAL NACIONAL',
            OR: [
                { timeCasa: { nome: { contains: 'TBD' } } },
                { timeVisitante: { nome: { contains: 'TBD' } } }
            ]
        },
        include: {
            timeCasa: true,
            timeVisitante: true
        }
    })

    if (proximoJogo) {
        if (proximoJogo.timeCasa.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeCasaId: vencedorId }
            })
        } else if (proximoJogo.timeVisitante.nome.includes('TBD')) {
            await prisma.jogo.update({
                where: { id: proximoJogo.id },
                data: { timeVisitanteId: vencedorId }
            })
        }
        console.log(`   ➡️  Time ${vencedorId} classificado para Final Nacional (Jogo ${proximoJogo.id})`)
    }
}

// ✅ VERIFICAR SE TEMPORADA REGULAR FOI FINALIZADA
async function verificarFinalizacaoTemporadaRegular() {
    try {
        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true }
        })

        if (!superliga) return

        const totalJogosTemporada = await prisma.jogo.count({
            where: {
                campeonatoId: superliga.id,
                fase: 'TEMPORADA REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId: superliga.id,
                fase: 'TEMPORADA REGULAR',
                status: 'FINALIZADO'
            }
        })

        console.log(`📊 Status Temporada Regular: ${jogosFinalizados}/${totalJogosTemporada} jogos finalizados`)

        if (totalJogosTemporada > 0 && jogosFinalizados === totalJogosTemporada) {
            console.log('🏆 TEMPORADA REGULAR FINALIZADA!')

            await prisma.campeonato.update({
                where: { id: superliga.id },
                data: {
                    status: 'PLAYOFFS',
                    configSuperliga: {
                        faseAtual: 'PLAYOFFS',
                        temporadaRegularFinalizada: new Date().toISOString()
                    } as any
                }
            })
        }
    } catch (error) {
        console.error('Erro ao verificar finalização da temporada regular:', error)
    }
}

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
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Time_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "MetaDados_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Conferencia_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Regional_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "DistribuicaoTime_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "PlayoffJogo_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1;')
            await prisma.$executeRawUnsafe('ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1;')

            console.log('✅ Sequences resetadas com sucesso!')
        } catch (sequenceError) {
            console.log('⚠️ Algumas sequences podem não existir ainda (normal em banco novo)')
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
            prisma.materia.count(),
        ])

        console.log('📊 Contagem final:')
        console.log(`   Times: ${counts[0]}`)
        console.log(`   Jogadores: ${counts[1]}`)
        console.log(`   Jogador-Time: ${counts[2]}`)
        console.log(`   Campeonatos: ${counts[3]}`)
        console.log(`   Conferências: ${counts[4]}`)
        console.log(`   Regionais: ${counts[5]}`)
        console.log(`   Distribuições: ${counts[6]}`)
        console.log(`   Jogos: ${counts[7]}`)
        console.log(`   Estatísticas: ${counts[8]}`)
        console.log(`   Matérias: ${counts[9]}`)

        if (counts.every(count => count === 0)) {
            console.log('🎉 BANCO ZERADO COM SUCESSO!')

            res.status(200).json({
                success: true,
                message: 'Banco de dados resetado com sucesso!',
                counts: {
                    times: counts[0],
                    jogadores: counts[1],
                    campeonatos: counts[3],
                    jogos: counts[7]
                }
            })
        } else {
            console.log('⚠️ Alguns dados podem não ter sido removidos')

            res.status(200).json({
                success: true,
                message: 'Reset concluído com avisos',
                counts: {
                    times: counts[0],
                    jogadores: counts[1],
                    campeonatos: counts[3],
                    jogos: counts[7]
                },
                warnings: 'Alguns registros podem não ter sido removidos'
            })
        }

    } catch (error) {
        console.error('❌ Erro ao resetar banco:', error)

        res.status(500).json({
            success: false,
            message: 'Erro ao resetar banco de dados',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
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

        // Verificar se o jogo existe
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

        // Preparar dados para atualização
        const dadosAtualizacao: any = {}

        // Atualizar placar se fornecido
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

        // Atualizar data se fornecida
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

        // Atualizar local se fornecido
        if (local !== undefined) {
            dadosAtualizacao.local = local.trim() || null
        }

        // Atualizar observações se fornecidas
        if (observacoes !== undefined) {
            dadosAtualizacao.observacoes = observacoes.trim() || null
        }

        // Atualizar status se fornecido
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

        // Se não há nada para atualizar
        if (Object.keys(dadosAtualizacao).length === 0) {
            res.status(400).json({ error: 'Nenhum dado fornecido para atualização' })
            return
        }

        // Atualizar o jogo
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
        console.log(`   ${jogoAtualizado.timeCasa.sigla} vs ${jogoAtualizado.timeVisitante.sigla}`)
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