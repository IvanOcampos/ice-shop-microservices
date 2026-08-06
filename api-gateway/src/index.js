const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

function verificarJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido. No podes pasar sin credenciales.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.headers['x-user-id'] = String(payload.id);
    req.headers['x-user-rol'] = payload.rol;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalido o expirado.' });
  }
}

app.post('/auth/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === 'pinguino' && password === 'hielo123') {
    const jwt2 = require('jsonwebtoken');
    const token = jwt2.sign(
      { id: 1, usuario, rol: 'admin' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({ token, mensaje: 'Bienvenido al sistema de hielo' });
  }
  res.status(401).json({ error: 'Credenciales incorrectas.' });
});

app.get('/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'api-gateway' });
});

app.use('/productos', verificarJWT, createProxyMiddleware({
  target: 'http://service-productos:3001',
  changeOrigin: true,
}));

app.use('/inventario', verificarJWT, createProxyMiddleware({
  target: 'http://service-inventario:3002',
  changeOrigin: true,
}));

app.use('/pedidos', verificarJWT, createProxyMiddleware({
  target: 'http://service-pedidos:3003',
  changeOrigin: true,
}));

app.use('/pagos', verificarJWT, createProxyMiddleware({
  target: 'http://service-pagos:3004',
  changeOrigin: true,
}));

app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no existe.` });
});

app.listen(3000, () => {
  console.log('API Gateway corriendo en http://localhost:3000');
});
