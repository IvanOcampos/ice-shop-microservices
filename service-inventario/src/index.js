const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

const db = new Pool({
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     5432,
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'inventario' });
});

// GET /inventario — listar todo el stock
app.get('/inventario', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM stock ORDER BY producto_id');
    res.json(rows);
  } catch (err) {
    console.error('[inventario] Error al listar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /inventario/stock/:producto_id — consultar stock de un producto
// Usado internamente por el servicio de pedidos
app.get('/inventario/stock/:producto_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM stock WHERE producto_id = $1',
      [req.params.producto_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado en inventario.' });
    }
    const item = rows[0];
    const disponible = item.cantidad - item.reservado;
    res.json({ ...item, disponible });
  } catch (err) {
    console.error('[inventario] Error al consultar stock:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /inventario/reservar — reservar unidades (lo llama servicio-pedidos)
app.post('/inventario/reservar', async (req, res) => {
  const { producto_id, cantidad } = req.body;

  if (!producto_id || !cantidad || cantidad <= 0) {
    return res.status(400).json({ error: 'producto_id y cantidad son requeridos.' });
  }

  try {
    // Verificar stock disponible
    const { rows } = await db.query(
      'SELECT * FROM stock WHERE producto_id = $1',
      [producto_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado en inventario.' });
    }

    const disponible = rows[0].cantidad - rows[0].reservado;
    if (disponible < cantidad) {
      return res.status(409).json({
        error: 'Stock insuficiente.',
        disponible,
        solicitado: cantidad
      });
    }

    // Reservar las unidades
    const { rows: updated } = await db.query(
      `UPDATE stock
       SET reservado = reservado + $1, actualizado = NOW()
       WHERE producto_id = $2
       RETURNING *`,
      [cantidad, producto_id]
    );

    console.log(`[inventario] Reservadas ${cantidad} unidades del producto ${producto_id}`);
    res.json({ mensaje: 'Unidades reservadas.', stock: updated[0] });
  } catch (err) {
    console.error('[inventario] Error al reservar:', err.message);
    res.status(500).json({ error: 'Error al reservar stock.' });
  }
});

// POST /inventario/liberar — liberar reserva si el pago falla
app.post('/inventario/liberar', async (req, res) => {
  const { producto_id, cantidad } = req.body;

  try {
    await db.query(
      `UPDATE stock
       SET reservado = GREATEST(0, reservado - $1), actualizado = NOW()
       WHERE producto_id = $2`,
      [cantidad, producto_id]
    );
    res.json({ mensaje: 'Reserva liberada.' });
  } catch (err) {
    console.error('[inventario] Error al liberar:', err.message);
    res.status(500).json({ error: 'Error al liberar reserva.' });
  }
});

// PUT /inventario/:producto_id — actualizar stock manualmente
app.put('/inventario/:producto_id', async (req, res) => {
  const { cantidad } = req.body;

  if (cantidad === undefined || cantidad < 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número positivo.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO stock (producto_id, cantidad)
       VALUES ($1, $2)
       ON CONFLICT (producto_id)
       DO UPDATE SET cantidad = $2, actualizado = NOW()
       RETURNING *`,
      [req.params.producto_id, cantidad]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[inventario] Error al actualizar:', err.message);
    res.status(500).json({ error: 'Error al actualizar stock.' });
  }
});

// DELETE /inventario/:producto_id — eliminar un producto del inventario
app.delete('/inventario/:producto_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM stock
       WHERE producto_id = $1
       RETURNING *`,
      [req.params.producto_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Producto no encontrado en inventario.'
      });
    }

    res.json({
      mensaje: 'Producto eliminado del inventario.',
      producto: rows[0]
    });

  } catch (err) {
    console.error('[inventario] Error al eliminar:', err.message);
    res.status(500).json({
      error: 'Error al eliminar el producto del inventario.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`🧊 Servicio Inventario corriendo en :${PORT}`);
});
