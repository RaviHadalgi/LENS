import cors from 'cors';
import express from 'express';

import sourceRoutes from './routes/source.routes';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'lens-server',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/sources', sourceRoutes);

app.listen(PORT, () => {
  console.log(
    `LENS server running at http://localhost:${PORT}`,
  );
});