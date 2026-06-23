# Spec: Alarife Lighthouse >= 95 para landings

Refs: SAN-316, ALA-55

## Objetivo

Cuando Sancho delega la creacion de una landing o pagina web al MSP/MCP de Alarife, el flujo debe garantizar que Alarife construya en draft, genere preview, mida Lighthouse/PageSpeed en mobile y no proponga publicacion hasta alcanzar un score promedio minimo de 95.

## Alcance

- Sancho debe entender que las tareas `web-build` y las landings que implican pagina publicada se resuelven con Alarife, no solo con copy de Dulcinea.
- Alarife debe usar `lighthouse-landing-qa` como gate antes de Sanson QA y antes de la aprobacion humana de publish.
- El loop de mejora debe continuar mientras el promedio mobile sea menor a 95.
- El usuario puede aprobar waivers solo para reglas que no contribuyen al score, por ejemplo diagnosticos informativos o preferencias visuales/UX que Lighthouse reporta sin peso.

## Definicion de score

El gate primario de ALA-55 es mobile.

- Categorias medidas: Performance, Accessibility, Best Practices y SEO.
- Promedio mobile requerido: `>= 95`.
- Piso por categoria en mobile: `>= 90`, salvo que una decision de producto explicita cambie el criterio en una iteracion futura.
- Las reglas/audits con peso de score no se pueden saltear para considerar aprobado el gate.
- Desktop se puede medir como senal secundaria cuando haya preview publico, pero no sustituye el gate mobile.

## Flujo operativo

1. Sancho detecta una tarea de pagina/landing/publicacion web.
2. Sancho delega a Alarife con skills:
   - `alarife-integration`
   - `payload`
   - `site-architecture`
   - `frontend-design`
   - `page-cro`
   - `form-cro`
   - `lighthouse-landing-qa`
3. Alarife solicita copy a Dulcinea y visuales a Maese Pedro cuando falten inputs.
4. Alarife crea draft en Payload y genera preview.
5. Alarife ejecuta Lighthouse/PageSpeed mobile contra el preview.
6. Si promedio mobile `>= 95`, pasa a Sanson QA y luego pide aprobacion humana para publicar.
7. Si promedio mobile `< 95`, Alarife propone cambios concretos, priorizados por impacto esperado, los aplica en draft tras aprobacion si afectan criterios de marca/producto, y vuelve a medir.
8. Si hay una regla sin contribucion al score que el usuario quiere mantener, Alarife registra un waiver con razon y sigue optimizando solo lo que afecta el gate.

## Waivers

Un waiver debe incluir:

- `auditId`
- razon humana
- confirmacion de que el audit no contribuye al score
- impacto aceptado

Los waivers no pueden cambiar el resultado de Performance, Accessibility, Best Practices o SEO. Si el promedio mobile no llega a 95, el gate sigue fallando aunque existan waivers.

## Entregables

- Skill `lighthouse-landing-qa` con workflow de medicion, mejora y waivers.
- Script `lighthouse_gate.mjs` para validar resultados de PageSpeed/Lighthouse.
- Routing de `web-build` a Alarife con Lighthouse QA incluido.
- Documentacion de Sancho MCP mostrando la delegacion correcta a Alarife.

## Criterios de aceptacion

- `resolveThreadSkills({ taskType: "web-build" })` devuelve `agent: "alarife"` e incluye `lighthouse-landing-qa`.
- La configuracion de Alarife incluye `lighthouse-landing-qa` en `web-build`.
- El dispatch map de Sancho reconoce triggers de Lighthouse/PageSpeed/Core Web Vitals como dominio de Alarife.
- El script del gate retorna exit code `0` si el promedio mobile cumple y `2` si falla.
- La publicacion sigue requiriendo aprobacion humana explicita.
