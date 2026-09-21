import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);

export default app;
