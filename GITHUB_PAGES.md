# GitHub Pages para CNC Tech Reportes

GitHub Pages solo puede servir el frontend estatico. El backend Node.js, las sesiones, la subida de archivos, SSE y la compilacion PDF siguen viviendo fuera de GitHub Pages.

## URL correcta

Si la cuenta u organizacion es `cnc-tech` y el repositorio es `reportes`, la URL queda:

`https://cnc-tech.github.io/reportes/`

Si quieres la raiz `https://cnc-tech.github.io/`, el repositorio debe llamarse exactamente `cnc-tech.github.io`.

## Forma mas simple

Este proyecto ya incluye un `index.html` en la raiz que redirige a `public/`.

Eso permite publicar directamente desde la raiz del repositorio en GitHub Pages.

## Preparacion local

Opcionalmente puedes ejecutar:

`npm run build:pages`

Eso genera la carpeta `docs/`, por si prefieres publicar desde `/docs`.

## Configuracion del frontend publicado

Antes de publicar, edita `public/config.js` con la URL real y permanente del backend.

Si eliges publicar desde `/docs`, aplica el mismo cambio en `docs/config.js` despues de generarla.

```js
window.CNC_TECH_CONFIG = {
  apiBaseUrl: "https://tu-backend-permanente.example.com",
  brandLogoUrl: "",
};
```

## Backend

Para este proyecto ya deje configurado un modo de backend local en esta misma PC.

La pagina publicada en GitHub Pages apuntara a:

`http://localhost:3221`

Esto significa que la web publicada funcionara correctamente cuando la abras desde esta misma PC, porque el navegador usara tu propio backend local.

No es un backend remoto para terceros. Si otra persona abre tu GitHub Pages desde otra maquina, intentara hablar con su propio localhost y no funcionara.

## Runtime gestionado

El proyecto ahora arranca el backend y los tuneles con un runtime gestionado.

Comandos:

`npm run start:pages-backend`

`npm run start:public-backend`

`npm run start:permanent-backend`

`npm run start:permanent-24x7`

`npm run status:managed-runtime`

`npm run status:runtime-monitor`

`npm run stop:managed-runtime`

`npm run stop:runtime-monitor`

Cuando arrancas uno de estos modos, el gestor hace lo siguiente:

1. Cierra el runtime gestionado anterior si existe.
2. Intenta recuperar el puerto si esta ocupado por un backend previo de este proyecto.
3. Inicia el backend nuevo y el tunel correspondiente.
4. Guarda PID, logs y datos del runtime en `tmp/managed-runtime.json`.

Con el monitor 24x7 activo (`start:permanent-24x7` o `start:public-24x7`), se ejecuta una verificacion periodica que reinicia backend/tunel si alguno cae.

Si el puerto esta ocupado por un proceso ajeno, el arranque falla para no matar un proceso no reconocido.

## Exponer este backend local

Tambien deje preparado un modo para exponer el backend de esta misma PC por un tunel publico usando Cloudflare.

Comando:

`npm run start:public-backend`

Ese comando:

1. Levanta el backend en `http://127.0.0.1:3221`.
2. Abre un tunel publico con `cloudflared`.
3. Imprime una URL `https://...trycloudflare.com` para usar como backend publico.

### Importante

La URL de `trycloudflare.com` no es permanente. Cambia cuando reinicias el tunel.

Si quieres que otras PCs usen siempre tu pagina publicada y que el backend siga estando en esta maquina, la siguiente etapa correcta es crear un tunel permanente de Cloudflare con cuenta y dominio propio.

## Tunel permanente preparado

Ya deje listo un arranque para tunel nombrado:

`npm run start:permanent-backend`

Para dejarlo autorecuperable en segundo plano:

`npm run start:permanent-24x7`

Antes de usarlo, haz esto una sola vez con tu cuenta de Cloudflare:

1. `cloudflared tunnel login`
2. `cloudflared tunnel create cnc-tech-reportes`
3. Crea un host DNS o una ruta publica para ese tunel.
4. Define la variable de entorno `CLOUDFLARED_TUNNEL_NAME=cnc-tech-reportes`

Opcionalmente puedes cambiar el puerto y origen permitido:

```powershell
$env:CLOUDFLARED_TUNNEL_NAME="cnc-tech-reportes"
$env:PORT="3226"
$env:CORS_ALLOWED_ORIGINS="https://ivanlipay-eng.github.io"
npm run start:permanent-backend
```

El runtime gestionado deja el backend local corriendo en esta PC y luego ejecuta `cloudflared tunnel run` con el nombre indicado.

Si quieres exponer un subdominio fijo, usa un archivo de configuracion de Cloudflare como base:

`cloudflared/config.yml.example`

## Arranque del backend local

Usa:

`npm run start:pages-backend`

Eso levanta el backend en `http://localhost:3221` y con CORS habilitado para GitHub Pages.

## Nota tecnica

El origen permitido para CORS queda configurado para:

`https://ivanlipay-eng.github.io`

Eso cubre la pagina publicada en:

`https://ivanlipay-eng.github.io/cnc-tech-reportes/`

## Ejemplo manual

Si quisieras levantarlo manualmente en Windows, seria asi:

```powershell
$env:HOST="127.0.0.1"
$env:PORT=3221
$env:CORS_ALLOWED_ORIGINS="https://ivanlipay-eng.github.io"
node server.js
```

## Pasos de GitHub Pages

1. Crea el repositorio `reportes` en la cuenta u organizacion `cnc-tech`.
2. Sube este proyecto.
3. Edita `public/config.js` con la URL permanente del backend.
4. En GitHub activa Pages con `Deploy from a branch`.
5. Elige la rama principal y la carpeta `/ (root)`.
6. La web quedara en `https://cnc-tech.github.io/reportes/`.

## Opcion alternativa

Si prefieres publicar desde `/docs`:

1. Ejecuta `npm run build:pages`.
2. Edita `docs/config.js`.
3. En GitHub Pages selecciona la carpeta `/docs`.