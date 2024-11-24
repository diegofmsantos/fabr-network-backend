import jwt from "jsonwebtoken"
import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { TimeSchema } from '../schemas/Time'
import { JogadorSchema } from '../schemas/Jogador'
import { Time } from '../types/time'
import { Jogador } from '../types/jogador'
import { Times } from '../data/times'
import { verificarPlano } from '../middlewares/authMiddleware'
import bcrypt from "bcrypt";

const prisma = new PrismaClient()

export const mainRouter = express.Router()

// Rota para obter todos os times com seus jogadores
mainRouter.get('/times', async (req, res) => {
    console.log('Rota /api/times chamada');
    try {
        const times = await prisma.time.findMany({
            include: { jogadores: true },
        });
        res.status(200).json(times);
    } catch (error) {
        console.error('Erro ao buscar os times:', error);
        res.status(500).json({ error: 'Erro ao buscar os times' });
    }
});


// Rota para obter todos os jogadores
mainRouter.get('/jogadores', async (req, res) => {
    try {
        const jogadores = await prisma.jogador.findMany({
            include: {
                time: true,
            },
        })

        res.status(200).json(jogadores)
    } catch (error) {
        console.error('Erro ao buscar os jogadores:', error);
        res.status(500).json({ error: 'Erro ao buscar os jogadores' });
    }
})

// Rota para adicionar um único time e seus jogadores
mainRouter.post('/time', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body)

        // Criação do time sem permitir campos `undefined`
        const createdTeam = await prisma.time.create({
            data: {
                nome: teamData.nome || '',
                sigla: teamData.sigla || '',
                cor: teamData.cor || '',
                cidade: teamData.cidade || '',
                bandeira_estado: teamData.bandeira_estado || '',
                fundacao: teamData.fundacao || '',
                logo: teamData.logo || '',
                capacete: teamData.capacete || '',
                instagram: teamData.instagram || '',
                instagram2: teamData.instagram2 || '',
                estadio: teamData.estadio || '',
                presidente: teamData.presidente || '',
                head_coach: teamData.head_coach || '',
                instagram_coach: teamData.instagram_coach || '',
                coord_ofen: teamData.coord_ofen || '',
                coord_defen: teamData.coord_defen || '',
                titulos: teamData.titulos || [],
            },
        })

        // Criação dos jogadores, sem permitir campos `undefined`
        if (teamData.jogadores && teamData.jogadores.length > 0) {
            await prisma.jogador.createMany({
                data: teamData.jogadores.map((player) => ({
                    nome: player.nome || '',
                    timeFormador: player.timeFormador || '',
                    posicao: player.posicao || '',
                    setor: player.setor || 'Ataque',
                    experiencia: player.experiencia || 0,
                    numero: player.numero || 0,
                    idade: player.idade || 0,
                    altura: player.altura || 0,
                    peso: player.peso || 0,
                    instagram: player.instagram || '',
                    instagram2: player.instagram2 || '',
                    cidade: player.cidade || '',
                    nacionalidade: player.nacionalidade || '',
                    camisa: player.camisa || '',
                    estatisticas: player.estatisticas || {},
                    timeId: createdTeam.id,
                })),
                skipDuplicates: true,
            })
        }

        res.status(201).json({
            team: createdTeam,
            players: teamData.jogadores?.length ? 'Jogadores criados' : 'Nenhum jogador adicionado',
        })
    } catch (error) {
        console.error('Erro ao criar time e jogadores:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

// Rota para adicionar múltiplos times e seus jogadores
mainRouter.post('/times', async (req, res) => {
    try {
        const teamsData: Time[] = req.body.map((teamData: any) => TimeSchema.parse(teamData))

        const createdTeams = await Promise.all(
            teamsData.map(async (teamData: Time) => {
                const createdTeam = await prisma.time.create({
                    data: {
                        nome: teamData.nome || '',
                        sigla: teamData.sigla || '',
                        cor: teamData.cor || '',
                        cidade: teamData.cidade || '',
                        bandeira_estado: teamData.bandeira_estado || '',
                        fundacao: teamData.fundacao || '',
                        logo: teamData.logo || '',
                        capacete: teamData.capacete || '',
                        instagram: teamData.instagram || '',
                        instagram2: teamData.instagram2 || '',
                        estadio: teamData.estadio || '',
                        presidente: teamData.presidente || '',
                        head_coach: teamData.head_coach || '',
                        instagram_coach: teamData.instagram_coach || '',
                        coord_ofen: teamData.coord_ofen || '',
                        coord_defen: teamData.coord_defen || '',
                        titulos: teamData.titulos || [],
                    },
                })

                if (teamData.jogadores && teamData.jogadores.length > 0) {
                    const players = teamData.jogadores.map((player: Jogador) => ({
                        nome: player.nome || '',
                        timeFormador: player.timeFormador || '',
                        posicao: player.posicao || '',
                        setor: player.setor || 'Ataque',
                        experiencia: player.experiencia || 0,
                        numero: player.numero || 0,
                        idade: player.idade || 0,
                        altura: player.altura || 0,
                        peso: player.peso || 0,
                        instagram: player.instagram || '',
                        instagram2: player.instagram2 || '',
                        cidade: player.cidade || '',
                        nacionalidade: player.nacionalidade || '',
                        camisa: player.camisa || '',
                        estatisticas: player.estatisticas || {},
                        timeId: createdTeam.id,
                    }))

                    await prisma.jogador.createMany({
                        data: players,
                        skipDuplicates: true,
                    })
                }

                return createdTeam;
            })
        )

        res.status(201).json({ teams: createdTeams })
    } catch (error) {
        console.error('Erro ao criar múltiplos times e jogadores:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

// Rota para adicionar um jogador a um time existente
mainRouter.post('/jogador', async (req, res) => {
    try {
        const jogadorData = JogadorSchema.parse(req.body)

        if (typeof jogadorData.timeId !== 'number') {
            throw new Error('O campo "timeId" é obrigatório e deve ser um número.')
        }

        const estatisticas = jogadorData.estatisticas ? jogadorData.estatisticas : {}

        const { id, time, ...jogadorDataWithoutIdAndTime } = jogadorData;

        const jogadorCriado = await prisma.jogador.create({
            data: {
                ...jogadorDataWithoutIdAndTime,
                nome: jogadorData.nome ?? '',
                posicao: jogadorData.posicao ?? '',
                setor: jogadorData.setor ?? 'Ataque',
                experiencia: jogadorData.experiencia ?? 0,
                numero: jogadorData.numero ?? 0,
                idade: jogadorData.idade ?? 0,
                altura: jogadorData.altura ?? 0,
                peso: jogadorData.peso ?? 0,
                instagram: jogadorData.instagram ?? '',
                instagram2: jogadorData.instagram2 ?? '',
                cidade: jogadorData.cidade ?? '',
                nacionalidade: jogadorData.nacionalidade ?? '',
                camisa: jogadorData.camisa ?? '',
                estatisticas: estatisticas,
                timeFormador: jogadorData.timeFormador ?? '',
                timeId: jogadorData.timeId,
            },
        })

        res.status(201).json({ jogador: jogadorCriado })
    } catch (error) {
        console.error('Erro ao criar o jogador:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

mainRouter.post('/importar-dados', async (req, res) => {
    try {
        const teamsData = Times;

        const createdTeams = await Promise.all(
            teamsData.map(async (teamData) => {
                const createdTeam = await prisma.time.create({
                    data: {
                        nome: teamData.nome || '',
                        sigla: teamData.sigla || '',
                        cor: teamData.cor || '',
                        cidade: teamData.cidade || '',
                        bandeira_estado: teamData.bandeira_estado || '',
                        fundacao: teamData.fundacao || '',
                        logo: teamData.logo || '',
                        capacete: teamData.capacete || '',
                        instagram: teamData.instagram || '',
                        instagram2: teamData.instagram2 || '',
                        estadio: teamData.estadio || '',
                        presidente: teamData.presidente || '',
                        head_coach: teamData.head_coach || '',
                        instagram_coach: teamData.instagram_coach || '',
                        coord_ofen: teamData.coord_ofen || '',
                        coord_defen: teamData.coord_defen || '',
                        titulos: teamData.titulos || [],
                    },
                });

                if (teamData.jogadores && teamData.jogadores.length > 0) {
                    const players = teamData.jogadores.map((player) => ({
                        nome: player.nome || '',
                        timeFormador: player.timeFormador || '',
                        posicao: player.posicao || '',
                        setor: player.setor || 'Ataque',
                        experiencia: player.experiencia || 0,
                        numero: player.numero || 0,
                        idade: player.idade || 0,
                        altura: player.altura || 0,
                        peso: player.peso || 0,
                        instagram: player.instagram || '',
                        instagram2: player.instagram2 || '',
                        cidade: player.cidade || '',
                        nacionalidade: player.nacionalidade || '',
                        camisa: player.camisa || '',
                        estatisticas: player.estatisticas || {},
                        timeId: createdTeam.id,
                    }));

                    await prisma.jogador.createMany({
                        data: players,
                        skipDuplicates: true,
                    });
                }

                return createdTeam;
            })
        );

        res.status(201).json({ message: 'Dados importados com sucesso!', teams: createdTeams });
    } catch (error) {
        console.error('Erro ao importar os dados:', error);
        res.status(500).json({ error: 'Erro ao importar os dados' });
    }
});

// Rota para atualizar informações de um time
mainRouter.put('/time/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Remove o campo 'id' do objeto antes de enviar para o Prisma
        const timeData = TimeSchema.parse(req.body); // Valida os dados recebidos
        const { id: _, jogadores, ...updateData } = timeData; // Remove campos indesejados como 'id' ou relações

        const updatedTime = await prisma.time.update({
            where: { id: parseInt(id) }, // Identifica o time pelo ID
            data: updateData, // Atualiza apenas os campos válidos
        });

        res.status(200).json(updatedTime);
    } catch (error) {
        console.error('Erro ao atualizar o time:', error);
        res.status(500).json({ error: 'Erro ao atualizar o time' });
    }
});


// Rota para atualizar informações de um jogador
mainRouter.put('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        // Valida o ID da URL
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" });
            return; // Garante que a execução pare aqui em caso de erro
        }

        // Captura e filtra os dados do corpo da requisição
        const jogadorData = req.body;
        const { estatisticas, ...restData } = jogadorData;

        // Remove campos indesejados ou vazios das estatísticas
        const filteredEstatisticas = estatisticas
            ? Object.fromEntries(
                Object.entries(estatisticas).map(([group, stats]) => [
                    group,
                    Object.fromEntries(
                        Object.entries(stats || {}).filter(
                            ([_, value]) => value !== undefined && value !== ""
                        )
                    ),
                ])
            )
            : {};

        // Dados finais para atualização
        const filteredData = {
            ...restData, // Outros campos do jogador
            estatisticas: filteredEstatisticas, // Estatísticas filtradas
        };

        // Atualiza o jogador no banco de dados
        const updatedJogador = await prisma.jogador.update({
            where: { id },
            data: filteredData,
        });

        // Responde com o jogador atualizado
        res.status(200).json(updatedJogador);
    } catch (error) {
        console.error("Erro ao atualizar o jogador:", error);
        res.status(500).json({ error: "Erro ao atualizar o jogador" });
    }
});

mainRouter.post("/cadastro", async (req: Request, res: Response) => {
    const { nome, email, senha, plano } = req.body;

    try {
        const existeUsuario = await prisma.usuario.findUnique({
            where: { email },
        });

        if (existeUsuario) {
            res.status(400).json({ error: "Email já cadastrado" });
            return
        }

        const hashedPassword = await bcrypt.hash(senha, 10);
        const usuario = await prisma.usuario.create({
            data: {
                nome,
                email,
                senha: hashedPassword,
                plano,
            },
        });

        res.status(201).json({ message: "Usuário cadastrado com sucesso", usuario });
    } catch (error) {
        res.status(400).json({ error: "Erro ao cadastrar usuário" });
    }
});


mainRouter.post('/login', async (req: Request, res: Response) => {
    const { email, senha } = req.body;

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { email },
        });

        if (!usuario) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return; // Evita que o código continue
        }

        const isPasswordValid = await bcrypt.compare(senha, usuario.senha);

        if (!isPasswordValid) {
            res.status(401).json({ error: 'Senha inválida' });
            return; // Evita que o código continue
        }

        const token = jwt.sign(
            { id: usuario.id, plano: usuario.plano },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '1h' }
        );

        res.status(200).json({ token }); // Envia o token
    } catch (error) {
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});


mainRouter.get('/times-basico', verificarPlano('BASICO'), async (req: Request, res: Response) => {
    try {
        const times = await prisma.time.findMany({ include: { jogadores: true } });
        res.status(200).json(times);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar times básico' });
    }
});

mainRouter.get('/times-padrao', verificarPlano('PADRAO'), async (req: Request, res: Response) => {
    try {
        const times = await prisma.time.findMany();
        res.status(200).json(times);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar times padrão' });
    }
});

mainRouter.get('/times-premium', verificarPlano('PREMIUM'), async (req: Request, res: Response) => {
    try {
        const times = await prisma.time.findMany({ include: { jogadores: true } });
        res.status(200).json(times);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar times premium' });
    }
});

mainRouter.get("/test", (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: "Usuário não autenticado" });
        return
    }
    res.status(200).json({ message: `Bem-vindo, ${req.user.plano}!` });
});



















