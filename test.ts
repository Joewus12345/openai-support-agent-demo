const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

redis.ping()
  .then((res: any) => {
    console.log('Redis responded:', res); // should print "PONG"
    return redis.quit();
  })
  .catch((err: any) => console.error('Redis connection failed:', err));
