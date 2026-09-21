import type { FastifyInstance } from 'fastify';
import { actualizarCategoria, crearCategoriaPersonalizada, eliminarCategoria, listarCategorias, type Categoria } from './categorias.js';
import { ErrorDominio } from '../../shared/errores.js';

function categoriaADto(categoria: Categoria) {
  return { id: categoria.id, nombre: categoria.nombre, esPredeterminada: categoria.esPredeterminada, icono: categoria.icono };
}

interface CrearCategoriaBody {
  nombre?: string;
  icono?: string | null;
}

interface ActualizarCategoriaBody {
  nombre?: string;
  icono?: string | null;
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

    const categoria = await crearCategoriaPersonalizada(request.identidad.tenantId, body.nombre, body.icono);
    reply.code(201).send(categoriaADto(categoria));
  });

  app.patch<{ Params: { categoriaId: string } }>('/categorias/:categoriaId', async (request, reply) => {
    const body = request.body as ActualizarCategoriaBody | undefined;
    const categoria = await actualizarCategoria(request.identidad.tenantId, request.params.categoriaId, {
      nombre: body?.nombre,
      icono: body?.icono,
    });
    reply.send(categoriaADto(categoria));
  });

  app.delete<{ Params: { categoriaId: string } }>('/categorias/:categoriaId', async (request, reply) => {
    await eliminarCategoria(request.identidad.tenantId, request.params.categoriaId);
    reply.code(204).send();
  });
}
