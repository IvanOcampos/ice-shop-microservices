const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;

const db = new Pool({
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     5432,
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'pagos' });
});

// GET /pagos — listar pagos
app.get('/pagos', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM pagos ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    console.error('[pagos] Error al listar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /pagos/:id
app.get('/pagos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM pagos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /pagos/cobrar — procesar un cobro (llamado internamente por pedidos)
app.post('/pagos/cobrar', async (req, res) => {
  const { usuario_id, producto_id, cantidad } = req.body;

  if (!usuario_id || !producto_id || !cantidad) {
    return res.status(400).json({ error: 'usuario_id, producto_id y cantidad son requeridos.' });
  }

  try {
    // Simulamos un precio fijo de $5 por unidad para simplificar
    // En producción consultaría al servicio de productos por el precio real
    const monto = cantidad * 5.00;

    // Simulamos que el 95% de los pagos se aprueban
    const aprobado = Math.random() > 0.05;

    if (!aprobado) {
      console.log(`[pagos] Pago rechazado para usuario ${usuario_id}`);
      return res.status(402).json({ error: 'Pago rechazado por el procesador. Verificá tu método de pago.' });
    }

    const { rows } = await db.query(
      `INSERT INTO pagos (usuario_id, producto_id, cantidad, monto, estado)
       VALUES ($1, $2, $3, $4, 'aprobado')
       RETURNING *`,
      [usuario_id, producto_id, cantidad, monto]
    );

    console.log(JSON.stringify({
      nivel: 'INFO',
      evento: 'pago_aprobado',
      pago_id: rows[0].id,
      monto,
      timestamp: new Date().toISOString()
    }));

    res.status(201).json({
      pago_id: rows[0].id,
      monto: rows[0].monto,
      estado: rows[0].estado,
      mensaje: 'Pago aprobado con éxito emocional 🧊'
    });

  } catch (err) {
    console.error('[pagos] Error al procesar:', err.message);
    res.status(500).json({ error: 'Error al procesar el pago.' });
  }
});

// PUT /pagos/:id — actualizar estado de un pago
app.put('/pagos/:id', async (req, res) => {
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({
      error: 'El estado es requerido.'
    });
  }

  try {
    const { rows } = await db.query(
      `UPDATE pagos
       SET estado = $1
       WHERE id = $2
       RETURNING *`,
      [estado, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Pago no encontrado.'
      });
    }

    res.json({
      mensaje: 'Pago actualizado correctamente.',
      pago: rows[0]
    });

  } catch (err) {
    console.error('[pagos] Error al actualizar:', err.message);
    res.status(500).json({
      error: 'Error al actualizar pago.'
    });
  }
});

// DELETE /pagos/:id — eliminar un pago
app.delete('/pagos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM pagos
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Pago no encontrado.'
      });
    }

    res.json({
      mensaje: 'Pago eliminado correctamente.',
      pago: rows[0]
    });

  } catch (err) {
    console.error('[pagos] Error al eliminar:', err.message);
    res.status(500).json({
      error: 'Error al eliminar pago.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`💳 Servicio Pagos corriendo en :${PORT}`);
});
