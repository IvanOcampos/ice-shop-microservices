CREATE TABLE IF NOT EXISTS stock (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL UNIQUE,
  cantidad    INTEGER NOT NULL DEFAULT 0,
  reservado   INTEGER NOT NULL DEFAULT 0,
  actualizado TIMESTAMP DEFAULT NOW()
);

-- Stock inicial para los 4 productos del servicio de productos
INSERT INTO stock (producto_id, cantidad) VALUES
  (1, 100),
  (2, 25),
  (3, 200),
  (4, 10);
