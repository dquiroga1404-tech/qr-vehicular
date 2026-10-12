const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Conexión exitosa a PostgreSQL');
        console.log(`📊 Base de datos: ${process.env.DB_NAME}`);
        
        const result = await client.query('SELECT NOW() as fecha');
        console.log('📅 Fecha del servidor:', result.rows[0].fecha);
        
        const tablas = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('\n📋 Tablas encontradas:');
        tablas.rows.forEach(tabla => {
            console.log(`  - ${tabla.table_name}`);
        });
        
        const mecanicos = await client.query('SELECT COUNT(*) FROM mecanicos');
        console.log(`\n👨‍🔧 Mecánicos: ${mecanicos.rows[0].count}`);
        
        const vehiculos = await client.query('SELECT COUNT(*) FROM vehiculos');
        console.log(`🚗 Vehículos: ${vehiculos.rows[0].count}`);
        
        client.release();
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nVerifica:');
        console.error('1. PostgreSQL esté corriendo');
        console.error('2. Credenciales en .env correctas');
        console.error('3. Base de datos qr_vehicular exista');
    } finally {
        pool.end();
    }
}

testConnection();