const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Conexión a la DB propia de este servicio
const db = new Pool({
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     5432,
});

// Middleware: verificar token interno (llamadas entre servicios)
function verificarInterno(req, res, next) {
  const secret = req.headers['x-internal-service'];
  if (secret && secret === process.env.INTERNAL_SECRET) return next();
  // También aceptamos requests del gateway (que ya validó el JWT)
  if (req.headers['x-user-id']) return next();
  return res.status(403).json({ error: 'Acceso no autorizado.' });
}

// GET /health
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'productos' });
});

// GET /productos
app.get('/productos', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM productos WHERE activo = true ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('[productos] Error al listar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /productos/:id
app.get('/productos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM productos WHERE id = $1 AND activo = true',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[productos] Error al obtener:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /productos
app.post('/productos', async (req, res) => {
  const { nombre, precio, descripcion } = req.body;

  if (!nombre || precio === undefined) {
    return res.status(400).json({ error: 'Los campos nombre y precio son requeridos.' });
  }
  if (isNaN(precio) || precio < 0) {
    return res.status(400).json({ error: 'El precio debe ser un número positivo.' });
  }

  try {
    const { rows } = await db.query(
      'INSERT INTO productos (nombre, precio, descripcion) VALUES ($1, $2, $3) RETURNING *',
      [nombre, precio, descripcion || null]
    );
    console.log(`[productos] Producto creado: ${rows[0].id} - ${nombre}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[productos] Error al crear:', err.message);
    res.status(500).json({ error: 'Error al crear el producto.' });
  }
});

// PUT /productos/:id
app.put('/productos/:id', async (req, res) => {
  const { nombre, precio, descripcion } = req.body;

  if (!nombre || precio === undefined) {
    return res.status(400).json({ error: 'Los campos nombre y precio son requeridos.' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE productos
       SET nombre = $1, precio = $2, descripcion = $3
       WHERE id = $4 AND activo = true
       RETURNING *`,
      [nombre, precio, descripcion || null, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[productos] Error al actualizar:', err.message);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
});

// DELETE /productos/:id (soft delete)
app.delete('/productos/:id', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE productos SET activo = false WHERE id = $1 AND activo = true',
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[productos] Error al eliminar:', err.message);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

app.listen(PORT, () => {
  console.log(`📦 Servicio Productos corriendo en :${PORT}`);
});
