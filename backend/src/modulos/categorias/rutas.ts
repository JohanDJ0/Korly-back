import type { FastifyInstance } from 'fastify';
import { crearCategoriaPersonalizada, eliminarCategoria, listarCategorias, type Categoria } from './categorias.js';
import { ErrorDominio } from '../../shared/errores.js';

function categoriaADto(categoria: Categoria) {
  return { id: categoria.id, nombre: categoria.nombre, esPredeterminada: categoria.esPredeterminada };
}

interface CrearCategoriaBody {
  nombre?: string;
}

export async function rutasCategorias(app: FastifyInstance): Promise<void> {
  app.get('/categorias', async (request, reply) => {
    const categorias = await listarCategorias(request.identidad.tenantId);
    reply.send(categorias.map(categoriaADto));
  });

  app.post('/categorias', async (request, reply) => {
    const body = request.body as CrearCategoriaBody | undefined;
    if (!body?.nombre) {
      throw new ErrorDominio('VALIDACION', "El campo 'nombre' es obligatorio");
    }

    const categoria = await crearCategoriaPersonalizada(request.identidad.tenantId, body.nombre);
    reply.code(201).send(categoriaADto(categoria));
  });

  app.delete<{ Params: { categoriaId: string } }>('/categorias/:categoriaId', async (request, reply) => {
    await eliminarCategoria(request.identidad.tenantId, request.params.categoriaId);
    reply.code(204).send();
  });
}
