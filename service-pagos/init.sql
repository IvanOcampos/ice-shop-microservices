CREATE TABLE IF NOT EXISTS pagos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad    INTEGER NOT NULL,
  monto       NUMERIC(10,2),
  estado      VARCHAR(20) DEFAULT 'aprobado',
  creado_en   TIMESTAMP DEFAULT NOW()
);
