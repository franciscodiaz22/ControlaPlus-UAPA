# Kilsy Maria Vasquez Rosario

## Rama
`feature/kilsy-crud`

## Responsabilidad
CRUD + Almacenamiento + Requisitos.

## Área principal de trabajo
Dentro de `app/src/app/`:

- `features/movimientos/` — formulario de alta y edición de movimientos.
- Operaciones de editar y eliminar en `core/offline/` (almacenamiento local).

El almacenamiento local de los movimientos está en `core/offline/`
(módulo de José Daniel). Cualquier cambio ahí debe coordinarse con él.

## Tareas principales
- Desarrollar el CRUD.
- Integrar el almacenamiento persistente.
- Documentar los requisitos relacionados con su módulo.

## Antes de entregar
- Probar el módulo.
- Verificar que no haya errores.
- Tomar las evidencias necesarias.
- Hacer commit en su rama.
- Crear Pull Request hacia main.

---

## Aporte realizado

Commit `bdb6bb6` — *Implementa CRUD y persistencia de movimientos* (2026-10-06, integrado en `main` por el PR #3):

- Operaciones `eliminar()` y `actualizar()` sobre el almacenamiento local.
- Botones Editar y Eliminar en la lista de Inicio.
- Componente de formulario de movimientos (`MovimientosFormComponent`) y su ruta.
- Componente de lista de movimientos (`MovimientosListaComponent`).

## Participación en pruebas

- Pruebas de creación de sus componentes incluidas en su commit
  (`movimientos-form.component.spec.ts` y `movimientos-lista.component.spec.ts`).

## Integración/complementación realizada por José

- Sincronización del CRUD con el servidor (versionado y eliminaciones pendientes), en el merge `6577d8f`.
- M2 (`1f80c12`): validación compartida de los datos, formulario de alta y edición dentro de la pestaña Inicio, edición del tipo y confirmación al eliminar. El componente de lista, que había quedado sin uso, se retiró.

## Pendientes y defensa

- Pendiente: documento de requisitos del módulo, pruebas del CRUD en un teléfono físico y sus evidencias.
- Defensa individual del módulo CRUD + Almacenamiento.
