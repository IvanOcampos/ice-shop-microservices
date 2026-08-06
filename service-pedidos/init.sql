CREATE TABLE IF NOT EXISTS pedidos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad    INTEGER NOT NULL,
  pago_id     INTEGER,
  estado      VARCHAR(20) DEFAULT 'pendiente',
  creado_en   TIMESTAMP DEFAULT NOW()
);
