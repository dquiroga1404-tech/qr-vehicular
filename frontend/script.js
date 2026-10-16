// ===== CONFIGURACIÓN =====
const API_URL = 'https://qr-vehicular.onrender.com/api';

// ===== ESTADO GLOBAL =====
let vehiculos = [];
let mecanicos = [];

// ===== UTILIDADES DE AUTENTICACIÓN =====
function getToken() {
    return localStorage.getItem('token');
}

function getUsuario() {
    const usuario = localStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}

function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.replace('login.html');
    }
}

// Wrapper de fetch que agrega el token automáticamente
async function fetchAuth(url, options = {}) {
    const token = getToken();
    
    if (!token) {
        window.location.replace('login.html');
        throw new Error('No hay sesión activa');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        alert('Sesión expirada. Por favor inicia sesión nuevamente.');
        window.location.href = 'login.html';
        throw new Error('Sesión expirada');
    }
    
    return response;
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    // Mostrar nombre del usuario
    const usuario = getUsuario();
    if (usuario) {
        document.getElementById('userName').textContent = `👤 ${usuario.nombre}`;
    }
    
    cargarMecanicos();
    cargarVehiculos();
});

// ===== MANEJO DEL FORMULARIO =====
document.getElementById('vehicleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const vehiculoData = {
        placa: document.getElementById('placa').value.trim().toUpperCase(),
        tipo_vehiculo: document.getElementById('tipoVehiculo').value,
        mecanico_id: document.getElementById('mecanico').value,
        marca: document.getElementById('marca').value.trim(),
        modelo: document.getElementById('modelo').value.trim(),
        año: document.getElementById('año').value ? parseInt(document.getElementById('año').value) : null,
        color: document.getElementById('color').value.trim()
    };
    
    if (!vehiculoData.placa || !vehiculoData.tipo_vehiculo || !vehiculoData.mecanico_id) {
        mostrarNotificacion('❌ Complete los campos obligatorios', 'error');
        return;
    }
    
    try {
        const response = await fetchAuth(`${API_URL}/vehiculos`, {
            method: 'POST',
            body: JSON.stringify(vehiculoData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion('✅ Vehículo registrado exitosamente');
            document.getElementById('vehicleForm').reset();
            cargarVehiculos();
        } else {
            mostrarNotificacion('❌ ' + (result.error || 'Error al registrar'), 'error');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

// ===== CARGAR MECÁNICOS =====
async function cargarMecanicos() {
    try {
        const response = await fetch(`${API_URL}/mecanicos`);
        const result = await response.json();
        
        if (result.success) {
            mecanicos = result.data;
            const select = document.getElementById('mecanico');
            
            select.innerHTML = '<option value="">Seleccionar mecánico...</option>';
            
            mecanicos.forEach(mecanico => {
                const option = document.createElement('option');
                option.value = String(mecanico.id);
                option.textContent = mecanico.nombre;
                select.appendChild(option);
            });
            
            document.getElementById('totalMecanicos').textContent = mecanicos.length;
        }
    } catch (error) {
        console.error('Error cargando mecánicos:', error);
        document.getElementById('mecanico').innerHTML = 
            '<option value="">Error al cargar mecánicos</option>';
    }
}

// ===== CARGAR VEHÍCULOS =====
async function cargarVehiculos() {
    const container = document.getElementById('vehiclesTableContainer');
    container.innerHTML = '<div class="loading">Cargando vehículos...</div>';
    
    try {
        const response = await fetchAuth(`${API_URL}/vehiculos`);
        const result = await response.json();
        
        if (result.success) {
            vehiculos = result.data;
            actualizarTabla();
            actualizarEstadisticas();
        } else {
            container.innerHTML = '<div class="error-message">Error al cargar vehículos</div>';
        }
    } catch (error) {
        console.error('Error cargando vehículos:', error);
    }
}

// ===== ACTUALIZAR TABLA =====
function actualizarTabla() {
    const container = document.getElementById('vehiclesTableContainer');
    
    if (vehiculos.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No hay vehículos registrados</div>';
        return;
    }
    
    let tablaHTML = `
        <table>
            <thead>
                <tr>
                    <th>Placa</th>
                    <th>Mecánico</th>
                    <th>Tipo</th>
                    <th>Marca/Modelo</th>
                    <th>Año</th>
                    <th>Color</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    vehiculos.forEach(vehiculo => {
        tablaHTML += `
            <tr>
                <td><strong>${vehiculo.placa}</strong></td>
                <td>${vehiculo.mecanico_nombre || 'No asignado'}</td>
                <td>${vehiculo.tipo_vehiculo}</td>
                <td>${vehiculo.marca || '-'} ${vehiculo.modelo || ''}</td>
                <td>${vehiculo.año || '-'}</td>
                <td>${vehiculo.color || '-'}</td>
                <td>${new Date(vehiculo.fecha_registro).toLocaleDateString()}</td>
                <td>
                <button class="btn btn-qr" onclick="mostrarQR('${vehiculo.id}')">Ver QR</button>
                <button class="btn btn-danger" onclick="eliminarVehiculo('${vehiculo.id}')">Eliminar</button>
                </td>
            </tr>
        `;
    });
    
    tablaHTML += '</tbody></table>';
    container.innerHTML = tablaHTML;
}

// ===== ACTUALIZAR ESTADÍSTICAS =====
function actualizarEstadisticas() {
    document.getElementById('totalVehiculos').textContent = vehiculos.length;
    
    const hoy = new Date().toDateString();
    const registrosHoy = vehiculos.filter(v => 
        new Date(v.fecha_registro).toDateString() === hoy
    ).length;
    
    document.getElementById('registrosHoy').textContent = registrosHoy;
}

// ===== MOSTRAR QR =====
async function mostrarQR(id) {
    try {
        const response = await fetchAuth(`${API_URL}/vehiculos/${id}`);
        const result = await response.json();
        
        if (result.success) {
            const vehiculo = result.data;
            const modal = document.getElementById('qrModal');
            const qrContainer = document.getElementById('qrCode');
            const qrInfo = document.getElementById('qrVehicleInfo');
            
            qrContainer.innerHTML = `
                <div style="display: inline-block; padding: 20px; background: white; border: 2px solid #000; border-radius: 10px;">
                    <div style="font-size: 100px; text-align: center;">📱</div>
                    <p style="text-align: center; font-weight: bold; margin: 5px 0;">${vehiculo.placa}</p>
                    <p style="text-align: center; font-size: 10px; color: #666;">${vehiculo.qr_hash || 'SIN HASH'}</p>
                </div>
            `;
            
            qrInfo.innerHTML = `
                <strong>${vehiculo.placa}</strong><br>
                ${vehiculo.marca || 'N/A'} ${vehiculo.modelo || ''} (${vehiculo.año || 'N/A'})<br>
                Tipo: ${vehiculo.tipo_vehiculo}<br>
                Mecánico: ${vehiculo.mecanico_nombre || 'No asignado'}<br>
                Hash: #${vehiculo.qr_hash || 'N/A'}
            `;
            
            modal.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error mostrando QR:', error);
        mostrarNotificacion('❌ Error al mostrar información', 'error');
    }
}

// ===== ELIMINAR VEHÍCULO =====
async function eliminarVehiculo(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este vehículo?')) {
        try {
            const response = await fetchAuth(`${API_URL}/vehiculos/${id}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                mostrarNotificacion('🗑️ Vehículo eliminado');
                cargarVehiculos();
            } else {
                mostrarNotificacion('❌ ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error eliminando vehículo:', error);
        }
    }
}

// ===== DESCARGAR REPORTES =====
async function descargarReporte(tipo) {
    const token = getToken();
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    mostrarNotificacion('📄 Generando reporte...');
    
    try {
        const response = await fetch(`${API_URL}/reportes/vehiculos/${tipo}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al generar reporte');
        }
        
        // Obtener el blob (archivo binario)
        const blob = await response.blob();
        
        // Determinar nombre del archivo
        const extension = tipo === 'pdf' ? 'pdf' : 'xlsx';
        const fecha = new Date().toISOString().split('T')[0];
        const nombreArchivo = `reporte-vehiculos-${fecha}.${extension}`;
        
        // Crear URL temporal y descargar
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        
        // Limpiar
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        mostrarNotificacion('✅ Reporte descargado exitosamente');
    } catch (error) {
        console.error('Error descargando reporte:', error);
        mostrarNotificacion('❌ Error al generar reporte', 'error');
    }
}

// ===== FUNCIONES AUXILIARES =====
function limpiarFormulario() {
    document.getElementById('vehicleForm').reset();
}

function cerrarModal() {
    document.getElementById('qrModal').style.display = 'none';
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.background = tipo === 'error' ? '#e74c3c' : '#27ae60';
    notification.textContent = mensaje;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
    const modal = document.getElementById('qrModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// ===== DETECTAR NAVEGACIÓN HACIA ATRÁS =====
window.addEventListener('popstate', function(event) {
    // Si el usuario presiona atrás, cerrar sesión automáticamente
    const token = localStorage.getItem('token');
    
    if (token) {
        // Cerrar sesión
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        
        // Redirigir al login reemplazando la entrada actual
        window.location.replace('login.html');
    }
});

// También bloquear el botón "adelante" deshabilitando el cache
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        // La página viene del cache (bfcache)
        // Verificar si hay token válido, si no, redirigir
        if (!localStorage.getItem('token')) {
            window.location.replace('login.html');
        }
    }
});