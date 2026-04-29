# HEPTA CCR - Plataforma Empresarial

## Ejecutar
```bash
docker compose up --build
```

## Funcionalidades clave
- Licenciamiento híbrido (local + validación online + modo gracia)
- Bloqueo por huella de máquina
- Modo restringido por licencia (solo lectura)
- Exportación CSV / XLSX / PDF
- Dashboard interactivo con drill-down
- UI completa en español
- Gestión de usuarios (admin) con edición y cambio de contraseña
- Integración UCM configurable (IP/puerto/credenciales)

## Endpoints nuevos
- `GET /api/license/status`
- `GET /api/export/cdr/xlsx`
- `GET /api/export/cdr/pdf`
- `POST /api/ucm/test-connection`
- `POST /api/ucm/sync-cdr`
