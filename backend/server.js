const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
require('dotenv').config();

// NUEVAS IMPORTACIONES
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración para manejar INT8 como string (CockroachDB)
const { types } = require('pg');
types.setTypeParser(20, function(val) {
    return val; // Devuelve el valor como string directamente
});

// ===== CONFIGURACIÓN COCKROACHDB =====
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Test de conexión
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a CockroachDB:', err.stack);
    } else {
        console.log('✅ Conexión exitosa a CockroachDB');
        release();
    }
});

// Ruta informativa del API
app.get('/api', (req, res) => {
    res.json({
        status: 'OK',
        message: 'API QR Vehicular - Servicio activo',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            mecanicos: '/api/mecanicos',
            vehiculos: '/api/vehiculos',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                recuperar: 'POST /api/auth/recuperar-password',
                restablecer: 'POST /api/auth/restablecer-password'
            },
            reportes: {
                pdf: '/api/reportes/vehiculos/pdf',
                excel: '/api/reportes/vehiculos/excel'
            }
        }
    });
});

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'QR Vehicular API - Servicio activo',
        api: '/api'
    });
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API QR Vehicular funcionando correctamente',
        database: 'qr_vehicular',
        timestamp: new Date().toISOString()
    });
});

// Obtener todos los mecánicos
app.get('/api/mecanicos', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM mecanicos ORDER BY nombre ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener mecánicos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener mecánicos' });
    }
});

// Crear mecánico
app.post('/api/mecanicos', async (req, res) => {
    const { nombre, email, telefono, especialidad } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO mecanicos (nombre, email, telefono, especialidad) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nombre, email, telefono, especialidad]
        );
        res.status(201).json({ 
            success: true, 
            data: result.rows[0],
            message: 'Mecánico registrado exitosamente' 
        });
    } catch (error) {
        console.error('Error al crear mecánico:', error);
        res.status(500).json({ success: false, error: 'Error al crear mecánico' });
    }
});

// Obtener todos los vehículos
app.get('/api/vehiculos', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, m.nombre as mecanico_nombre 
            FROM vehiculos v
            LEFT JOIN mecanicos m ON v.mecanico_id = m.id
            ORDER BY v.fecha_registro DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener vehículos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener vehículos' });
    }
});

// Obtener vehículo por ID
app.get('/api/vehiculos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT v.*, m.nombre as mecanico_nombre 
            FROM vehiculos v
            LEFT JOIN mecanicos m ON v.mecanico_id = m.id
            WHERE v.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Vehículo no encontrado' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error al obtener vehículo:', error);
        res.status(500).json({ success: false, error: 'Error al obtener vehículo' });
    }
});

// Crear vehículo
app.post('/api/vehiculos', verificarToken, async (req, res) => {
    const { placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id } = req.body;
    
    try {
        // Verificar si la placa ya existe
        const placaExistente = await pool.query(
            'SELECT id FROM vehiculos WHERE placa = $1', [placa]
        );
        
        if (placaExistente.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ya existe un vehículo con esta placa' 
            });
        }
        
        // Generar hash para QR
        const qrHash = generateQRHash(placa);
        const qrCode = `QRV-${placa}-${Date.now()}`;
        
        const result = await pool.query(
            `INSERT INTO vehiculos (placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id, qr_code, qr_hash) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id, qrCode, qrHash]
        );
        
        res.status(201).json({ 
            success: true, 
            data: result.rows[0],
            message: 'Vehículo registrado exitosamente' 
        });
    } catch (error) {
        console.error('Error al crear vehículo:', error);
        res.status(500).json({ success: false, error: 'Error al crear vehículo' });
    }
});

// Actualizar vehículo
app.put('/api/vehiculos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id, estado } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE vehiculos 
             SET placa = $1, tipo_vehiculo = $2, marca = $3, modelo = $4, 
                 año = $5, color = $6, mecanico_id = $7, estado = $8,
                 ultima_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING *`,
            [placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id, estado, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Vehículo no encontrado' });
        }
        
        res.json({ 
            success: true, 
            data: result.rows[0],
            message: 'Vehículo actualizado exitosamente' 
        });
    } catch (error) {
        console.error('Error al actualizar vehículo:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar vehículo' });
    }
});

// Eliminar vehículo
app.delete('/api/vehiculos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await pool.query(
            'DELETE FROM vehiculos WHERE id = $1 RETURNING *', [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Vehículo no encontrado' });
        }
        
        res.json({ 
            success: true, 
            message: 'Vehículo eliminado exitosamente' 
        });
    } catch (error) {
        console.error('Error al eliminar vehículo:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar vehículo' });
    }
});

// ========================================
// ===== AUTENTICACIÓN DE USUARIOS =====
// ========================================

// Middleware para verificar token JWT
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
}

// Middleware para verificar rol admin
function verificarAdmin(req, res, next) {
    if (req.usuario.rol !== 'admin') {
        return res.status(403).json({ success: false, error: 'Acceso denegado. Se requiere rol admin' });
    }
    next();
}

// REGISTRO DE USUARIOS
app.post('/api/auth/register', async (req, res) => {
    const { nombre, email, password } = req.body;
    
    if (!nombre || !email || !password) {
        return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
    }
    
    try {
        // Verificar si el email ya existe
        const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        
        // Hash de la contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        const result = await pool.query(
            'INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email, rol',
            [nombre, email, password_hash]
        );
        
        res.status(201).json({ 
            success: true, 
            data: result.rows[0], 
            message: 'Usuario registrado exitosamente' 
        });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, error: 'Error al registrar usuario' });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email y contraseña son obligatorios' });
    }
    
    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
        
        const usuario = result.rows[0];
        const passwordValido = await bcrypt.compare(password, usuario.password_hash);
        
        if (!passwordValido) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
        
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRACION || '24h' }
        );
        
        res.json({ 
            success: true, 
            data: { 
                token, 
                usuario: { 
                    id: usuario.id, 
                    nombre: usuario.nombre, 
                    email: usuario.email, 
                    rol: usuario.rol 
                } 
            } 
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
    }
});

// VERIFICAR SESIÓN
app.get('/api/auth/verificar', verificarToken, async (req, res) => {
    res.json({ success: true, usuario: req.usuario });
});

// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
app.post('/api/auth/recuperar-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        const result = await pool.query('SELECT id, nombre FROM usuarios WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            // Por seguridad, siempre respondemos igual
            return res.json({ success: true, message: 'Si el email existe, recibirás un correo con instrucciones' });
        }
        
        const usuario = result.rows[0];
        
        // Generar token temporal (expira en 30 min)
        const resetToken = jwt.sign(
            { id: usuario.id, tipo: 'reset' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        
        // Guardar token en la BD
        await pool.query(
            'UPDATE usuarios SET reset_token = $1, reset_token_expira = NOW() + INTERVAL \'30 minutes\' WHERE id = $2',
            [resetToken, usuario.id]
        );
        
        // Configurar transporter de correo
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        
        console.log('🌐 FRONTEND_URL actual:', process.env.FRONTEND_URL);
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
        
        // Enviar correo
      await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Recuperación de Contraseña - QR Vehicular',
    html: 
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Recuperación de Contraseña</h2>
            <p>Hola <strong>${usuario.nombre}</strong>,</p>
            <p>Has solicitado restablecer tu contraseña en QR Vehicular.</p>
            <p>Haz click en el siguiente enlace para crear una nueva contraseña:</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                    Restablecer Contraseña
                </a>
            </p>
            <p style="color: #7f8c8d; font-size: 13px; margin-top: 30px;">
                Si el botón no funciona, copia y pega esta URL en tu navegador:
            </p>
            <p style="background: #f8f9fa; padding: 12px; border-radius: 5px; word-break: break-all; font-size: 12px; color: #2c3e50;">
                ${resetUrl}
            </p>
            <p style="color: #e74c3c;"><strong>Este enlace expira en 30 minutos.</strong></p>
            <p>Si no solicitaste esto, ignora este correo.</p>
            <hr>
            <p style="color: #7f8c8d; font-size: 12px;">QR Vehicular - Sistema de Gestión Vehicular</p>
        </div>
    
});
        
        res.json({ success: true, message: 'Si el email existe, recibirás un correo con instrucciones' });
    } catch (error) {
        console.error('Error en recuperación:', error);
        res.status(500).json({ success: false, error: 'Error al procesar solicitud' });
    }
});

// RESTABLECER CONTRASEÑA
app.post('/api/auth/restablecer-password', async (req, res) => {
    const { token, nuevaPassword } = req.body;
    
    if (!token || !nuevaPassword) {
        return res.status(400).json({ success: false, error: 'Token y nueva contraseña son obligatorios' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.tipo !== 'reset') {
            return res.status(400).json({ success: false, error: 'Token inválido' });
        }
        
        // Verificar que el token no haya expirado
        const result = await pool.query(
            'SELECT id FROM usuarios WHERE id = $1 AND reset_token = $2 AND reset_token_expira > NOW()',
            [decoded.id, token]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Token expirado o ya utilizado' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(nuevaPassword, salt);
        
        await pool.query(
            'UPDATE usuarios SET password_hash = $1, reset_token = NULL, reset_token_expira = NULL WHERE id = $2',
            [password_hash, decoded.id]
        );
        
        res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Error al restablecer:', error);
        res.status(400).json({ success: false, error: 'Token inválido o expirado' });
    }
});

// ========================================
// ===== REPORTES PDF y EXCEL =====
// ========================================

// Reporte PDF de vehículos
app.get('/api/reportes/vehiculos/pdf', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.placa, v.tipo_vehiculo, v.marca, v.modelo, v.año, v.color, m.nombre as mecanico
            FROM vehiculos v
            LEFT JOIN mecanicos m ON v.mecanico_id = m.id
            ORDER BY v.placa
        `);
        
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-vehiculos-${Date.now()}.pdf`);
        
        doc.pipe(res);
        
        // Encabezado
        doc.fontSize(20).fillColor('#2c3e50').text('QR VEHICULAR', { align: 'center' });
        doc.fontSize(14).fillColor('#3498db').text('Reporte de Vehículos Registrados', { align: 'center' });
        doc.moveDown();
        doc.fontSize(9).fillColor('#666').text(`Fecha de generación: ${new Date().toLocaleString('es-CO')}`, { align: 'right' });
        doc.text(`Reporte No: RPT-${Date.now()}`, { align: 'right' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        
        // Encabezados de tabla
        const tableTop = doc.y;
        const colWidths = [70, 90, 80, 80, 50, 70, 110];
        const headers = ['Placa', 'Tipo', 'Marca', 'Modelo', 'Año', 'Color', 'Mecánico'];
        
        let x = 50;
        doc.fontSize(10).fillColor('#2c3e50');
        headers.forEach((header, i) => {
            doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
            x += colWidths[i];
        });
        
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);
        
        // Filas
        let y = doc.y;
        doc.fontSize(9).fillColor('#333');
        
        result.rows.forEach((row, index) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }
            
            x = 50;
            const valores = [
                row.placa,
                row.tipo_vehiculo,
                row.marca || '-',
                row.modelo || '-',
                row.año?.toString() || '-',
                row.color || '-',
                row.mecanico || '-'
            ];
            
            valores.forEach((valor, i) => {
                doc.text(valor, x, y, { width: colWidths[i], align: 'left' });
                x += colWidths[i];
            });
            
            y += 20;
        });
        
        doc.moveDown(2);
        doc.fontSize(10).fillColor('#2c3e50');
        doc.text(`Total de vehículos: ${result.rows.length}`, { align: 'right' });
        doc.moveDown();
        doc.fontSize(8).fillColor('#999').text('QR Vehicular - Sistema de Gestión de Vehículos', { align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generando PDF:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error al generar reporte PDF' });
        }
    }
});

// Reporte Excel de vehículos
app.get('/api/reportes/vehiculos/excel', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.placa, v.tipo_vehiculo, v.marca, v.modelo, v.año, v.color, m.nombre as mecanico
            FROM vehiculos v
            LEFT JOIN mecanicos m ON v.mecanico_id = m.id
            ORDER BY v.placa
        `);
        
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'QR Vehicular';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet('Vehículos');
        
        // Título
        worksheet.mergeCells('A1:G1');
        const tituloCell = worksheet.getCell('A1');
        tituloCell.value = 'QR VEHICULAR - Reporte de Vehículos';
        tituloCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        tituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;
        
        // Info
        worksheet.mergeCells('A2:G2');
        worksheet.getCell('A2').value = `Fecha de generación: ${new Date().toLocaleString('es-CO')} | Reporte No: RPT-${Date.now()}`;
        worksheet.getCell('A2').alignment = { horizontal: 'right' };
        worksheet.getCell('A2').font = { size: 10, italic: true };
        
        // Headers
        worksheet.getRow(4).values = ['Placa', 'Tipo', 'Marca', 'Modelo', 'Año', 'Color', 'Mecánico'];
        worksheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3498DB' } };
        worksheet.getRow(4).alignment = { horizontal: 'center' };
        
        // Columnas
        worksheet.columns = [
            { key: 'placa', width: 15 },
            { key: 'tipo', width: 15 },
            { key: 'marca', width: 15 },
            { key: 'modelo', width: 15 },
            { key: 'año', width: 10 },
            { key: 'color', width: 12 },
            { key: 'mecanico', width: 20 }
        ];
        
        // Datos
        result.rows.forEach(row => {
            worksheet.addRow({
                placa: row.placa,
                tipo: row.tipo_vehiculo,
                marca: row.marca || '-',
                modelo: row.modelo || '-',
                año: row.año || '-',
                color: row.color || '-',
                mecanico: row.mecanico || '-'
            });
        });
        
        // Fila de total
        const totalRow = worksheet.addRow({ placa: `Total: ${result.rows.length} vehículos` });
        totalRow.font = { bold: true };
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-vehiculos-${Date.now()}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generando Excel:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error al generar reporte Excel' });
        }
    }
});


// Función para generar hash QR
function generateQRHash(placa) {
    let hash = 0;
    const combined = placa + Date.now();
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 10);
}

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📱 Accesible desde: 10.91.203.197:${PORT}`);
});