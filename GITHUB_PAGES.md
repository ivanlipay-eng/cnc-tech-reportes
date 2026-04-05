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

El backend debe estar accesible por HTTPS y permitir CORS para GitHub Pages.

Ejemplo en Windows:

```powershell
$env:PORT=3220
$env:CORS_ALLOWED_ORIGINS="https://cnc-tech.github.io"
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