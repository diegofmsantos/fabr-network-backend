// schemas/Materia.ts
import { z } from 'zod'

export const MateriaSchema = z.object({
    id: z.number().optional(),
    titulo: z.string(),
    subtitulo: z.string(),
    imagem: z.string(),
    texto: z.string(),
    autor: z.string(),
    autorImage: z.string(), // Campo adicionado
    createdAt: z.date().optional(),
    updatedAt: z.date().optional()
})

export type Materia = z.infer<typeof MateriaSchema>