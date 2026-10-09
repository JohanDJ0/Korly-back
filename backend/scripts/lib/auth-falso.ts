/**
 * Supabase Auth de mentira, SOLO para las pruebas de punta a punta (`frontend/e2e`). Habla el pedazo del protocolo de
 * GoTrue que usan `@supabase/supabase-js` en el navegador y el servidor de Korly: iniciar sesión, registrarse, leer y
 * actualizar al usuario, cerrar sesión, recuperar contraseña, renovar el token y, para el backend, consultar y borrar
 * usuarios con la llave de servicio. Las sesiones son JWT sin firma real: no protegen nada, y por eso este servidor
 * solo escucha en localhost y el script que lo levanta se niega a combinarse con una base que no sea local.
 *
 * Qué NO imita (y por lo tanto estas pruebas no cubren): el correo de confirmación real, el captcha, los límites de
 * Supabase ni sus mensajes de error exactos más allá de los que la app muestra. Para el flujo de "confirma tu correo",
 * un correo que contenga `+confirmar` se registra SIN sesión (como cuando Supabase exige confirmar el correo).
 *
 * Además de GoTrue, expone `/__e2e/*` para que las pruebas preparen usuarios (p. ej. uno con un aviso de privacidad
 * viejo) y consulten su estado.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

interface UsuarioFalso {
  id: string;
  email: string;
  password: string;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
}

const VIGENCIA_SEGUNDOS = 3600;

const base64url = (texto: string | Buffer) => Buffer.from(texto).toString('base64url');

export interface AuthFalso {
  puerto: number;
  cerrar: () => Promise<void>;
}

export async function iniciarAuthFalso(puerto: number): Promise<AuthFalso> {
  const usuarios = new Map<string, UsuarioFalso>();
  const refrescos = new Map<string, string>(); // refresh_token -> id de usuario

  const porCorreo = (correo: string) => [...usuarios.values()].find((u) => u.email.toLowerCase() === correo.toLowerCase());

  function usuarioPublico(u: UsuarioFalso) {
    return {
      id: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: u.email,
      email_confirmed_at: u.creadoEn,
      phone: '',
      confirmed_at: u.creadoEn,
      last_sign_in_at: u.actualizadoEn,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: u.metadata,
      identities: [],
      created_at: u.creadoEn,
      updated_at: u.actualizadoEn,
      is_anonymous: false,
    };
  }

  function emitirSesion(u: UsuarioFalso) {
    const ahora = Math.floor(Date.now() / 1000);
    const expiraEn = ahora + VIGENCIA_SEGUNDOS;
    const cabecera = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const carga = base64url(JSON.stringify({ aud: 'authenticated', exp: expiraEn, iat: ahora, sub: u.id, email: u.email, role: 'authenticated', session_id: randomUUID() }));
    const refresco = randomBytes(12).toString('hex');
    refrescos.set(refresco, u.id);
    return {
      access_token: `${cabecera}.${carga}.${base64url(randomBytes(16))}`,
      token_type: 'bearer',
      expires_in: VIGENCIA_SEGUNDOS,
      expires_at: expiraEn,
      refresh_token: refresco,
      user: usuarioPublico(u),
    };
  }

  /** El usuario dueño de un `Authorization: Bearer <jwt>` emitido por este servidor, o `null`. */
  function usuarioDelToken(peticion: IncomingMessage): UsuarioFalso | null {
    const encabezado = peticion.headers.authorization;
    if (!encabezado?.startsWith('Bearer ')) return null;
    const partes = encabezado.slice(7).split('.');
    if (partes.length !== 3 || !partes[1]) return null;
    try {
      const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as { sub?: string; exp?: number };
      if (!carga.sub || (carga.exp ?? 0) < Date.now() / 1000) return null;
      return usuarios.get(carga.sub) ?? null;
    } catch {
      return null;
    }
  }

  const leerCuerpo = (peticion: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolver) => {
      const trozos: Buffer[] = [];
      peticion.on('data', (t: Buffer) => trozos.push(t));
      peticion.on('end', () => {
        try {
          resolver(trozos.length > 0 ? (JSON.parse(Buffer.concat(trozos).toString('utf8')) as Record<string, unknown>) : {});
        } catch {
          resolver({});
        }
      });
    });

  function responder(res: ServerResponse, estado: number, cuerpo?: unknown) {
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
  }
  const error = (res: ServerResponse, estado: number, codigo: string, mensaje: string) => responder(res, estado, { code: estado, error_code: codigo, msg: mensaje });

  async function atender(peticion: IncomingMessage, res: ServerResponse) {
    // El navegador (otro origen) manda preflight con apikey/x-client-info: se acepta todo.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', (peticion.headers['access-control-request-headers'] as string | undefined) ?? '*');
    if (peticion.method === 'OPTIONS') return responder(res, 204);

    const url = new URL(peticion.url ?? '/', `http://localhost:${puerto}`);
    const ruta = url.pathname;
    const metodo = peticion.method ?? 'GET';

    // ---- Ayudas para las pruebas (no existen en GoTrue) ----
    if (ruta === '/__e2e/usuarios' && metodo === 'POST') {
      const cuerpo = await leerCuerpo(peticion);
      const correo = String(cuerpo.email ?? '');
      if (!correo || porCorreo(correo)) return error(res, 422, 'user_already_exists', 'Ese correo ya existe');
      const ahora = new Date().toISOString();
      const u: UsuarioFalso = { id: randomUUID(), email: correo, password: String(cuerpo.password ?? ''), metadata: (cuerpo.metadata as Record<string, unknown>) ?? {}, creadoEn: ahora, actualizadoEn: ahora };
      usuarios.set(u.id, u);
      return responder(res, 201, usuarioPublico(u));
    }
    if (ruta === '/__e2e/usuarios' && metodo === 'GET') {
      const correo = url.searchParams.get('email');
      const u = correo ? porCorreo(correo) : undefined;
      return u ? responder(res, 200, usuarioPublico(u)) : error(res, 404, 'user_not_found', 'No existe');
    }

    // ---- GoTrue ----
    if (ruta === '/auth/v1/token' && metodo === 'POST') {
      const tipo = url.searchParams.get('grant_type');
      const cuerpo = await leerCuerpo(peticion);
      if (tipo === 'password') {
        const u = porCorreo(String(cuerpo.email ?? ''));
        if (!u || u.password !== String(cuerpo.password ?? '')) return error(res, 400, 'invalid_credentials', 'Invalid login credentials');
        return responder(res, 200, emitirSesion(u));
      }
      if (tipo === 'refresh_token') {
        const id = refrescos.get(String(cuerpo.refresh_token ?? ''));
        const u = id ? usuarios.get(id) : undefined;
        return u ? responder(res, 200, emitirSesion(u)) : error(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      }
      return error(res, 400, 'validation_failed', 'grant_type no soportado');
    }

    if (ruta === '/auth/v1/signup' && metodo === 'POST') {
      const cuerpo = await leerCuerpo(peticion);
      const correo = String(cuerpo.email ?? '');
      if (!correo || String(cuerpo.password ?? '').length < 6) return error(res, 422, 'weak_password', 'La contraseña es muy corta');
      if (porCorreo(correo)) return error(res, 422, 'user_already_exists', 'User already registered');
      const ahora = new Date().toISOString();
      const u: UsuarioFalso = { id: randomUUID(), email: correo, password: String(cuerpo.password), metadata: (cuerpo.data as Record<string, unknown>) ?? {}, creadoEn: ahora, actualizadoEn: ahora };
      usuarios.set(u.id, u);
      // Supabase con "Confirm email" activo no da sesión hasta confirmar el correo.
      return correo.includes('+confirmar') ? responder(res, 200, usuarioPublico(u)) : responder(res, 200, emitirSesion(u));
    }

    if (ruta === '/auth/v1/user' && metodo === 'GET') {
      const u = usuarioDelToken(peticion);
      return u ? responder(res, 200, usuarioPublico(u)) : error(res, 401, 'bad_jwt', 'invalid JWT');
    }

    if (ruta === '/auth/v1/user' && metodo === 'PUT') {
      const u = usuarioDelToken(peticion);
      if (!u) return error(res, 401, 'bad_jwt', 'invalid JWT');
      const cuerpo = await leerCuerpo(peticion);
      if (typeof cuerpo.password === 'string') u.password = cuerpo.password;
      if (typeof cuerpo.email === 'string') u.email = cuerpo.email; // Supabase pediría confirmar; aquí basta
      if (cuerpo.data && typeof cuerpo.data === 'object') u.metadata = { ...u.metadata, ...(cuerpo.data as Record<string, unknown>) };
      u.actualizadoEn = new Date().toISOString();
      return responder(res, 200, usuarioPublico(u));
    }

    if (ruta === '/auth/v1/logout' && metodo === 'POST') return responder(res, 204);
    if (ruta === '/auth/v1/recover' && metodo === 'POST') {
      await leerCuerpo(peticion);
      return responder(res, 200, {});
    }

    const admin = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(ruta);
    if (admin?.[1]) {
      const u = usuarios.get(admin[1]);
      if (!u) return error(res, 404, 'user_not_found', 'User not found');
      if (metodo === 'GET') return responder(res, 200, usuarioPublico(u));
      if (metodo === 'DELETE') {
        usuarios.delete(u.id);
        return responder(res, 200, {});
      }
    }

    return error(res, 404, 'not_found', `Ruta no simulada: ${metodo} ${ruta}`);
  }

  const servidor: Server = createServer((peticion, res) => {
    atender(peticion, res).catch((e) => error(res, 500, 'unexpected_failure', String(e)));
  });
  await new Promise<void>((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', resolver);
  });

  return {
    puerto,
    cerrar: () => new Promise((resolver) => {
      servidor.closeAllConnections();
      servidor.close(() => resolver());
    }),
  };
}
