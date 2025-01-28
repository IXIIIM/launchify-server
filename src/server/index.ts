import express from 'express';
import cors from 'cors';
import http from 'http';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import WebSocketServer from './services/websocket';
import { setupNotificationProcessor } from './jobs/notification-processor';
import { setupSubscriptionNotificationJobs } from './jobs/subscription-notifications';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import matchingRoutes from './routes/matching';
import subscriptionRoutes from './routes/subscriptions';
import messagesRoutes from './routes/messages';
import analyticsRoutes from './routes/analytics';
import notificationRoutes from './routes/notifications';
import uploadRoutes from './routes/upload';
import verificationRoutes from './routes/verification';
import usageRoutes from './routes/usage';
import devRoutes from './routes/dev';

// Import middleware
import { authenticateToken } from './middleware/auth';

// Initialize environment variables
dotenv.config();

// Initialize database and cache clients
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);
app.set('wsServer', wsServer);

// Set up notification processors
const notificationScheduler = setupNotificationProcessor(wsServer);
app.set('notificationScheduler', notificationScheduler);

// Set up subscription notification jobs
setupSubscriptionNotificationJobs(wsServer);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/matching', authenticateToken, matchingRoutes);
app.use('/api/subscriptions', authenticateToken, subscriptionRoutes);
app.use('/api/messages', authenticateToken, messagesRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api/verification', authenticateToken, verificationRoutes);
app.use('/api/usage', authenticateToken, usageRoutes);

// Development routes
if (process.env.NODE_ENV === 'development') {
  app.use('/api/dev', devRoutes);
}

// Global error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Handle shutdown gracefully
const gracefulShutdown = async () => {
  console.log('Received shutdown signal...');
  
  try {
    // Close all WebSocket connections
    wsServer.close();
    
    // Disconnect from Redis
    await redis.quit();
    
    // Disconnect from database
    await prisma.$disconnect();
    
    // Close HTTP server
    server.close(() => {
      console.log('Server shut down successfully');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`WebSocket server initialized`);
});

export default server;