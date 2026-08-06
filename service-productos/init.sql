CREATE TABLE IF NOT EXISTS productos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  precio      NUMERIC(10,2) NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT true,
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- Datos de prueba
INSERT INTO productos (nombre, precio, descripcion) VALUES
  ('Cubo de Hielo Premium', 4.99, 'Hielo cristalino de alta pureza'),
  ('Bloque Ártico', 12.50, 'Bloque de hielo de 5kg para eventos'),
  ('Hielo Triturado', 2.99, 'Ideal para cócteles y bebidas'),
  ('Hielo Seco 1kg', 18.00, 'Para efectos de niebla y conservación');
