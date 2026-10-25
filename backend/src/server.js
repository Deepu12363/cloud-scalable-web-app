import 'dotenv/config';
import app from './app.js';
import connectDB from './config/database.js';
import Device from './models/Device.js';
import Telemetry from './models/Telemetry.js';

const port = process.env.PORT || 5000;
const host = '0.0.0.0';

const startServer = async () => {
  try {
    await connectDB();
    await Promise.all([Device.init(), Telemetry.init()]);
    app.listen(port, host, () => {
      console.log(`Backend server running on ${host}:${port}`);
    });
  } catch (error) {
    console.error(`Unable to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
