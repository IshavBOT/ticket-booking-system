import { app } from './app';
import { config } from './config';
import { migrate } from './db';
import { startWorker } from './queue';

migrate().then(() => {
  startWorker();
  app.listen(config.port, () => console.log(`API listening on :${config.port}`));
});
