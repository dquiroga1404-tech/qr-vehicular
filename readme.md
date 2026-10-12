# QR Vehicular

Sistema de gestión vehicular con códigos QR, autenticación JWT y base de datos distribuida en CockroachDB.

## Tecnologías
- **Backend:** Node.js, Express
- **Frontend:** HTML5, CSS3, JavaScript
- **Base de datos:** CockroachDB (PostgreSQL compatible)
- **Autenticación:** JWT + bcrypt
- **Reportes:** PDFKit, ExcelJS
- **Correo:** Nodemailer + Mailtrap

## Funcionalidades
- Registro y login de usuarios con JWT
- Recuperación de contraseña por correo electrónico
- Gestión de vehículos (CRUD)
- Asignación de mecánicos
- Generación de códigos QR
- Reportes en PDF y Excel
- Roles de usuario (admin/usuario)

## Estructura del proyecto
- `/backend`: API REST con Node.js y Express
- `/frontend`: Aplicación web cliente
- `/database`: Scripts SQL para CockroachDB

## Autor
Daniel Mejía