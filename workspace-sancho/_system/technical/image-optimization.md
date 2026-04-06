# Image Optimization Convention

## Regla
Toda imagen generada para uso en RRSS o web DEBE optimizarse antes de guardar.

## Por API

### OpenAI (gpt-image-1 / gpt-image-1.5)
- Usar `--output-format webp` directamente en gen.py
- Ejemplo: `python3 {baseDir}/scripts/gen.py --output-format webp --size 1536x1024`

### Gemini (Nano Banana Pro)
- Genera PNG por defecto (no soporta WebP nativo)
- Post-procesar con: `./scripts/optimize-image.sh <ruta_imagen> 82 1200`

## Script de compresión
- **Individual**: `./scripts/optimize-image.sh <imagen> [quality=82] [max_width=1200]`
- **Batch**: `./scripts/optimize-batch.sh <directorio> [quality=82] [max_width=1200]`

## Qué hace
1. Convierte PNG/JPG → WebP (quality 82, método 6)
2. Resize a max 1200px de ancho si es mayor
3. Mueve original a subcarpeta `originals/`
4. Reporta reducción de tamaño

## Parámetros recomendados
| Uso | Quality | Max Width |
|-----|---------|-----------|
| RRSS / Web | 82 | 1200 |
| Alta calidad (portfolio) | 90 | 1600 |
| Thumbnails | 75 | 600 |

## Dependencia
- `cwebp` (libwebp) — instalado via `brew install webp`
