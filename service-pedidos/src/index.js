const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

const db = new Pool({
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     5432,
});

// Headers para llamadas internas entre servicios
const headersInternos = { 'x-internal-service': INTERNAL_SECRET };

// ─────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────
class CircuitBreaker {
  constructor(nombre, umbralFallos = 3, tiempoReset = 30000) {
    this.nombre = nombre;
    this.fallos = 0;
    this.umbralFallos = umbralFallos;
    this.estado = 'CERRADO';
    this.ultimoFallo = null;
    this.tiempoReset = tiempoReset;
  }

  async ejecutar(fn) {
    if (this.estado === 'ABIERTO') {
      const pasado = Date.now() - this.ultimoFallo;
      if (pasado < this.tiempoReset) {
        const restante = Math.ceil((this.tiempoReset - pasado) / 1000);
        throw new Error(`Circuit breaker ABIERTO para [${this.nombre}]. Reintentar en ${restante}s.`);
      }
      this.estado = 'SEMIABIERTO';
    }

    try {
      const resultado = await fn();
      this.fallos = 0;
      this.estado = 'CERRADO';
      return resultado;
    } catch (err) {
      this.fallos++;
      this.ultimoFallo = Date.now();
      if (this.fallos >= this.umbralFallos) {
        this.estado = 'ABIERTO';
        console.error(JSON.stringify({
          nivel: 'ERROR',
          evento: 'circuit_breaker_abierto',
          servicio: this.nombre,
          timestamp: new Date().toISOString()
        }));
      }
      throw err;
    }
  }
}

const cbInventario = new CircuitBreaker('inventario');
const cbPagos = new CircuitBreaker('pagos');

// GET /health
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'pedidos' });
});

// GET /pedidos — listar pedidos del usuario
app.get('/pedidos', async (req, res) => {
  try {
    const usuarioId = req.headers['x-user-id'];
    const { rows } = await db.query(
      'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY creado_en DESC',
      [usuarioId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[pedidos] Error al listar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /pedidos/:id
app.get('/pedidos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM pedidos WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[pedidos] Error al obtener:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /pedidos — crear pedido (orquesta inventario + pagos)
app.post('/pedidos', async (req, res) => {
  const { producto_id, cantidad } = req.body;
  const usuario_id = req.headers['x-user-id'] || 1;

  if (!producto_id || !cantidad || cantidad <= 0) {
    return res.status(400).json({ error: 'producto_id y cantidad son requeridos.' });
  }

  let stockReservado = false;

  try {
    // 1. Verificar y reservar stock
    await cbInventario.ejecutar(() =>
      axios.post(
        'http://service-inventario:3002/inventario/reservar',
        { producto_id, cantidad },
        { headers: headersInternos, timeout: 5000 }
      )
    );
    stockReservado = true;

    console.log(JSON.stringify({
      nivel: 'INFO',
      evento: 'stock_reservado',
      producto_id,
      cantidad,
      timestamp: new Date().toISOString()
    }));

    // 2. Procesar pago
    const pagoRes = await cbPagos.ejecutar(() =>
      axios.post(
        'http://service-pagos:3004/pagos/cobrar',
        { usuario_id, producto_id, cantidad },
        { headers: headersInternos, timeout: 5000 }
      )
    );

    // 3. Guardar pedido confirmado
    const { rows } = await db.query(
      `INSERT INTO pedidos (usuario_id, producto_id, cantidad, pago_id, estado)
       VALUES ($1, $2, $3, $4, 'confirmado')
       RETURNING *`,
      [usuario_id, producto_id, cantidad, pagoRes.data.pago_id]
    );

    console.log(JSON.stringify({
      nivel: 'INFO',
      evento: 'pedido_creado',
      pedido_id: rows[0].id,
      timestamp: new Date().toISOString()
    }));

    res.status(201).json(rows[0]);

  } catch (err) {
    // Compensación: si el pago falló pero el stock ya estaba reservado, liberamos
    if (stockReservado) {
      try {
        await axios.post(
          'http://service-inventario:3002/inventario/liberar',
          { producto_id, cantidad },
          { headers: headersInternos, timeout: 3000 }
        );
        console.log(JSON.stringify({
          nivel: 'WARN',
          evento: 'stock_liberado_por_fallo',
          producto_id,
          timestamp: new Date().toISOString()
        }));
      } catch (libErr) {
        console.error('[pedidos] Error al liberar stock:', libErr.message);
      }
    }

    console.error(JSON.stringify({
      nivel: 'ERROR',
      evento: 'pedido_fallido',
      mensaje: err.message,
      timestamp: new Date().toISOString()
    }));

    if (err.message.includes('Circuit breaker')) {
      return res.status(503).json({ error: 'Servicio temporalmente no disponible. Intentá de nuevo en unos segundos.' });
    }
    if (err.response?.status === 409) {
      return res.status(409).json(err.response.data);
    }

    res.status(500).json({ error: 'Error al procesar el pedido.' });
  }
});

// PUT /pedidos/:id — actualizar estado del pedido
app.put('/pedidos/:id', async (req, res) => {
  const { estado } = req.body;

  const estadosValidos = [
    'pendiente',
    'confirmado',
    'enviado',
    'entregado',
    'cancelado'
  ];

  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({
      error: 'Estado no válido.'
    });
  }

  try {
    const { rows } = await db.query(
      `UPDATE pedidos
       SET estado = $1
       WHERE id = $2
       RETURNING *`,
      [estado, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Pedido no encontrado.'
      });
    }

    res.json({
      mensaje: 'Pedido actualizado correctamente.',
      pedido: rows[0]
    });

  } catch (err) {
    console.error('[pedidos] Error al actualizar:', err.message);
    res.status(500).json({
      error: 'Error al actualizar pedido.'
    });
  }
});

// DELETE /pedidos/:id — cancelar pedido
app.delete('/pedidos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE pedidos SET estado = 'cancelado'
       WHERE id = $1 AND estado = 'confirmado'
       RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado o ya fue cancelado.' });
    }
    res.json({ mensaje: 'Pedido cancelado.', pedido: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar el pedido.' });
  }
});

app.listen(PORT, () => {
  console.log(`🛒 Servicio Pedidos corriendo en :${PORT}`);
});
