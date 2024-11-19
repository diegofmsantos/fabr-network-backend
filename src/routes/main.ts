import { PrismaClient } from '@prisma/client';
import express from 'express';
import { TimeSchema } from '../schemas/Time';
import { Time } from '../types/time';
import { Jogador } from '../types/jogador';
import { JogadorSchema } from '../schemas/Jogador';

const prisma = new PrismaClient();
export const mainRouter = express.Router();

// Rota para obter todos os times com seus jogadores
mainRouter.get('/times', async (req, res) => {
    try {
        const times = await prisma.time.findMany({
            include: {
                jogadores: true,
            },
        });

        res.status(200).json(times);
    } catch (error) {
        console.error('Erro ao buscar os times:', error);
        res.status(500).json({ error: 'Erro ao buscar os times' });
    }
});

// Rota para adicionar um único time e seus jogadores
mainRouter.post('/time', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body);

        const createdTeam = await prisma.time.create({
            data: {
                id: teamData.id,
                nome: teamData.nome || '',
                sigla: teamData.sigla || '',
                cor: teamData.cor || '',
                cidade: teamData.cidade || '',
                fundacao: teamData.fundacao || '',
                logo: teamData.logo || '',
                capacete: teamData.capacete || '',
                instagram: teamData.instagram || '',
                instagram2: teamData.instagram2 || '',
                estadio: teamData.estadio || '',
                presidente: teamData.presidente || '',
                head_coach: teamData.head_coach || '',
                coord_ofen: teamData.coord_ofen || '',
                coord_defen: teamData.coord_defen || '',
                titulos: teamData.titulos ?? [],
                brasileirao: teamData.brasileirao ?? false,
            },
        });

        const players = teamData.jogadores?.map(player => ({
            id: player.id,
            nome: player.nome || '',
            posicao: player.posicao || '',
            setor: player.setor || 'Ataque',
            experiencia: player.experiencia ?? 0,
            numero: player.numero ?? 0,
            idade: player.idade ?? 0,
            altura: player.altura ?? 0,
            peso: player.peso ?? 0,
            instagram: player.instagram || '',
            instagram2: player.instagram2 || '',
            cidade: player.cidade || '',
            nacionalidade: player.nacionalidade || '',
            camisa: player.camisa || '',
            estatisticas: player.estatisticas || undefined,
            timeId: createdTeam.id,
        })) ?? [];

        if (players.length > 0) {
            await prisma.jogador.createMany({
                data: players,
                skipDuplicates: true, // Evita duplicatas com base no ID
            });
        }

        res.status(201).json({
            team: createdTeam,
            players: players.length ? 'Jogadores criados' : 'Nenhum jogador adicionado',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});

// Rota para adicionar múltiplos times e seus jogadores
mainRouter.post('/times', async (req, res) => {
    try {
        const teamsData: Time[] = req.body.map((teamData: any) => {
            return TimeSchema.parse(teamData);
        });

        const createdTeams = [];

        for (const teamData of teamsData) {
            const createdTeam = await prisma.time.create({
                data: {
                    id: teamData.id,
                    nome: teamData.nome || '',
                    sigla: teamData.sigla || '',
                    cor: teamData.cor || '',
                    cidade: teamData.cidade || '',
                    fundacao: teamData.fundacao || '',
                    logo: teamData.logo || '',
                    capacete: teamData.capacete || '',
                    instagram: teamData.instagram || '',
                    instagram2: teamData.instagram2 || '',
                    estadio: teamData.estadio || '',
                    presidente: teamData.presidente || '',
                    head_coach: teamData.head_coach || '',
                    coord_ofen: teamData.coord_ofen || '',
                    coord_defen: teamData.coord_defen || '',
                    titulos: teamData.titulos ?? [],
                    brasileirao: teamData.brasileirao ?? false,
                },
            });

            createdTeams.push(createdTeam);

            const players = teamData.jogadores?.map((player: Jogador) => ({
                id: player.id,
                nome: player.nome || '',
                posicao: player.posicao || '',
                setor: player.setor || 'Ataque',
                experiencia: player.experiencia ?? 0,
                numero: player.numero ?? 0,
                idade: player.idade ?? 0,
                altura: player.altura ?? 0,
                peso: player.peso ?? 0,
                instagram: player.instagram || '',
                instagram2: player.instagram2 || '',
                cidade: player.cidade || '',
                nacionalidade: player.nacionalidade || '',
                camisa: player.camisa || '',
                estatisticas: player.estatisticas || undefined,
                timeId: createdTeam.id,
            })) ?? [];

            if (players.length > 0) {
                await prisma.jogador.createMany({
                    data: players,
                    skipDuplicates: true,
                });
            }
        }

        res.status(201).json({
            teams: createdTeams,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});

mainRouter.get('/jogadores', async (req, res) => {
    try {
        const jogadores = await prisma.jogador.findMany({
            include: {
                time: true, // Incluindo os detalhes do time
            },
        });

        // Logando os dados recuperados para verificar
        console.log('Jogadores recuperados do banco:', jogadores);

        res.status(200).json(jogadores);
    } catch (error) {
        console.error('Erro ao buscar os jogadores:', error);
        res.status(500).json({ error: 'Erro ao buscar os jogadores' });
    }
});


// Rota para adicionar um jogador a um time existente
mainRouter.post('/jogador', async (req, res) => {
    try {
        // Validação dos dados do jogador usando Zod
        const jogadorData = JogadorSchema.parse(req.body);

        if (!jogadorData.timeId) {
            res.status(400).json({ error: 'timeId é obrigatório e não pode ser undefined' });
            return;
        }

        // Verifica se o time relacionado existe
        const time = await prisma.time.findUnique({
            where: {
                id: jogadorData.timeId,
            },
        });

        if (!time) {
            res.status(404).json({ error: 'Time não encontrado' });
            return;
        }

        // Criação do jogador no banco de dados
        const jogadorCriado = await prisma.jogador.create({
            data: {
                nome: jogadorData.nome || '',
                posicao: jogadorData.posicao || '',
                setor: jogadorData.setor || 'Ataque',
                experiencia: jogadorData.experiencia ?? 0,
                numero: jogadorData.numero ?? 0,
                idade: jogadorData.idade ?? 0,
                altura: jogadorData.altura ?? 0,
                peso: jogadorData.peso ?? 0,
                instagram: jogadorData.instagram || '',
                instagram2: jogadorData.instagram2 || '',
                cidade: jogadorData.cidade || '',
                nacionalidade: jogadorData.nacionalidade || '',
                camisa: jogadorData.camisa || '',
                estatisticas: jogadorData.estatisticas || {},
                timeId: jogadorData.timeId,
            },
        });

        res.status(201).json({ jogador: jogadorCriado });
    } catch (error) {
        console.error('Erro ao criar o jogador:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});
