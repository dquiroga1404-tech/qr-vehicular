


-- ============================================
-- SISTEMA QR VEHICULAR - ESQUEMA DE BASE DE DATOS
-- ============================================

-- Crear la base de datos (ejecutar por separado)
-- CREATE DATABASE sistema_qr_vehicular;

-- Conectar a la base de datos
-- \c sistema_qr_vehicular;

-- ===== TABLA: MECÁNICOS =====
CREATE TABLE IF NOT EXISTS mecanicos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    telefono VARCHAR(20),
    especialidad VARCHAR(100),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE
);

-- ===== TABLA: VEHÍCULOS =====
CREATE TABLE IF NOT EXISTS vehiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(20) UNIQUE NOT NULL,
    tipo_vehiculo VARCHAR(50) NOT NULL,
    marca VARCHAR(50),
    modelo VARCHAR(50),
    año INT CHECK (año >= 1950 AND año <= 2026),
    color VARCHAR(30),
    mecanico_id INT REFERENCES mecanicos(id) ON DELETE SET NULL,
    qr_code TEXT,
    qr_hash VARCHAR(50) UNIQUE,
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'mantenimiento')),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABLA: MANTENIMIENTOS =====
CREATE TABLE IF NOT EXISTS mantenimientos (
    id SERIAL PRIMARY KEY,
    vehiculo_id INT REFERENCES vehiculos(id) ON DELETE CASCADE,
    mecanico_id INT REFERENCES mecanicos(id) ON DELETE SET NULL,
    tipo_mantenimiento VARCHAR(100),
    descripcion TEXT,
    costo DECIMAL(10,2) CHECK (costo >= 0),
    fecha_mantenimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'completado', 'cancelado'))
);

-- ===== ÍNDICES =====
CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON vehiculos(placa);
CREATE INDEX IF NOT EXISTS idx_vehiculos_mecanico ON vehiculos(mecanico_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_tipo ON vehiculos(tipo_vehiculo);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_vehiculo ON mantenimientos(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_mecanico ON mantenimientos(mecanico_id);
CREATE INDEX IF NOT EXISTS idx_mecanicos_nombre ON mecanicos(nombre);

-- ===== DATOS DE EJEMPLO =====
INSERT INTO mecanicos (nombre, email, telefono, especialidad) VALUES
('Juan Pérez', 'juan.perez@email.com', '555-0101', 'Motor'),
('María García', 'maria.garcia@email.com', '555-0102', 'Transmisión'),
('Carlos López', 'carlos.lopez@email.com', '555-0103', 'Electricidad'),
('Ana Martínez', 'ana.martinez@email.com', '555-0104', 'Frenos'),
('Pedro Sánchez', 'pedro.sanchez@email.com', '555-0105', 'Suspensión');

INSERT INTO vehiculos (placa, tipo_vehiculo, marca, modelo, año, color, mecanico_id) VALUES
('ABC-123', 'Sedán', 'Toyota', 'Corolla', 2022, 'Blanco', 1),
('XYZ-789', 'SUV', 'Honda', 'CR-V', 2023, 'Negro', 2),
('DEF-456', 'Camioneta', 'Ford', 'F-150', 2021, 'Rojo', 3),
('GHI-789', 'Deportivo', 'Chevrolet', 'Camaro', 2022, 'Amarillo', 1),
('JKL-012', 'Motocicleta', 'Yamaha', 'YZF-R3', 2023, 'Azul', 4);

-- ===== VISTAS ÚTILES =====
-- Vista de vehículos con información completa
CREATE OR REPLACE VIEW vista_vehiculos_completa AS
SELECT 
    v.id,
    v.placa,
    v.tipo_vehiculo,
    v.marca,
    v.modelo,
    v.año,
    v.color,
    v.estado,
    m.nombre AS mecanico_nombre,
    m.email AS mecanico_email,
    m.telefono AS mecanico_telefono,
    v.fecha_registro,
    v.ultima_actualizacion
FROM vehiculos v
LEFT JOIN mecanicos m ON v.mecanico_id = m.id;

-- ===== FUNCIONES =====
-- Función para contar vehículos por tipo
CREATE OR REPLACE FUNCTION contar_vehiculos_por_tipo()
RETURNS TABLE (tipo_vehiculo VARCHAR, total BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT v.tipo_vehiculo, COUNT(*) as total
    FROM vehiculos v
    GROUP BY v.tipo_vehiculo
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener estadísticas
CREATE OR REPLACE FUNCTION obtener_estadisticas()
RETURNS TABLE (
    total_vehiculos BIGINT,
    total_mecanicos BIGINT,
    total_mantenimientos BIGINT,
    vehiculos_activos BIGINT,
    vehiculos_mantenimiento BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM vehiculos),
        (SELECT COUNT(*) FROM mecanicos WHERE activo = TRUE),
        (SELECT COUNT(*) FROM mantenimientos),
        (SELECT COUNT(*) FROM vehiculos WHERE estado = 'activo'),
        (SELECT COUNT(*) FROM vehiculos WHERE estado = 'mantenimiento');
END;
$$ LANGUAGE plpgsql;