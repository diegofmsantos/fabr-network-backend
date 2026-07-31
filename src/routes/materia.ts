import { PrismaClient } from '@prisma/client'
import express from 'express'
import multer from 'multer'
import { put } from '@vercel/blob'
import { protectWrites } from '../middleware/auth'
import { cacheControlLeitura } from '../middleware/cache'
import { gerarSlug } from '../utils/jogadorUtils'

const prisma = new PrismaClient()

export const materiaRouter = express.Router()

materiaRouter.use(protectWrites)
// Notícias mudam pouco (posts esporádicos) — 60s de cache no CDN, servindo
// conteúdo levemente desatualizado por até 5min enquanto revalida em segundo plano.
materiaRouter.use(cacheControlLeitura(60))

const uploadImagem = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true)
        else cb(null, false)
    }
})

// Recebe uma imagem (capa da matéria ou foto do autor) e sobe pro Vercel Blob,
// devolvendo a URL pública. Substitui o antigo fluxo de salvar a imagem como
// base64 direto na coluna do banco (inflava o payload de /materias em dezenas de MB).
materiaRouter.post('/upload-imagem', uploadImagem.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhuma imagem enviada' })
            return
        }

        const extensao = req.file.originalname.split('.').pop() || 'jpg'
        const nomeBase = gerarSlug(req.file.originalname.replace(/\.[^.]+$/, '')) || 'imagem'
        const caminho = `materias/${nomeBase}.${extensao}`

        const blob = await put(caminho, req.file.buffer, {
            access: 'public',
            addRandomSuffix: true,
            contentType: req.file.mimetype,
            token: process.env.BLOB_READ_WRITE_TOKEN
        })

        res.status(201).json({ url: blob.url })
    } catch (error) {
        console.error('Erro ao subir imagem:', error)
        res.status(500).json({ error: 'Erro ao subir imagem' })
    }
})

// Campos leves para listagem — NÃO inclui `texto` (corpo do artigo), que pode
// ser grande. Evita transferir o corpo de todas as matérias só pra montar uma
// lista de cards.
const CAMPOS_LISTAGEM = {
    id: true,
    titulo: true,
    subtitulo: true,
    imagem: true,
    legenda: true,
    autor: true,
    autorImage: true,
    tipo: true,
    createdAt: true,
    updatedAt: true
}

materiaRouter.get('/', async (req, res) => {
    try {
        const { tipo, limite } = req.query

        const materias = await prisma.materia.findMany({
            where: tipo && typeof tipo === 'string' ? { tipo } : undefined,
            select: CAMPOS_LISTAGEM,
            orderBy: {
                createdAt: 'desc'
            },
            take: limite ? parseInt(limite as string) : undefined
        });
        res.status(200).json(materias)
    } catch (error) {
        console.error('Erro ao buscar as matérias:', error)
        res.status(500).json({ error: 'Erro ao buscar as matérias' })
    }
})

materiaRouter.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' })
            return
        }

        const materia = await prisma.materia.findUnique({ where: { id } })

        if (!materia) {
            res.status(404).json({ error: 'Matéria não encontrada' })
            return
        }

        res.status(200).json(materia)
    } catch (error) {
        console.error('Erro ao buscar matéria:', error)
        res.status(500).json({ error: 'Erro ao buscar matéria' })
    }
})

materiaRouter.post('/', async (req, res) => {
    try {
        const materiaData = req.body;

        const createdMateria = await prisma.materia.create({
            data: {
                titulo: materiaData.titulo,
                subtitulo: materiaData.subtitulo,
                imagem: materiaData.imagem,
                legenda: materiaData.legenda,
                texto: materiaData.texto,
                autor: materiaData.autor,
                autorImage: materiaData.autorImage,
                tipo: materiaData.tipo || 'NORMAL',
                createdAt: new Date(materiaData.createdAt),
                updatedAt: new Date(materiaData.updatedAt)
            }
        });

        res.status(201).json(createdMateria);
    } catch (error) {
        console.error('Erro ao criar matéria:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

materiaRouter.put('/:id', async (req, res) => {
    const { id } = req.params;
    const materiaData = req.body;

    try {
        const updatedMateria = await prisma.materia.update({
            where: { id: parseInt(id) },
            data: {
                ...materiaData,
                createdAt: new Date(materiaData.createdAt),
                updatedAt: new Date(materiaData.updatedAt)
            }
        });

        res.status(200).json(updatedMateria);
    } catch (error) {
        console.error('Erro ao atualizar matéria:', error);
        res.status(500).json({ error: 'Erro ao atualizar matéria' });
    }
});

materiaRouter.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        const existingMateria = await prisma.materia.findUnique({
            where: { id }
        })
        if (!existingMateria) {
            res.status(404).json({ error: "Matéria não encontrada" })
            return
        }

        await prisma.materia.delete({
            where: { id }
        })

        res.status(200).json({ message: "Matéria excluída com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir matéria:", error)
        res.status(500).json({ error: "Erro ao excluir matéria" })
    }
})