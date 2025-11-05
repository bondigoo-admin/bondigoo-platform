const Redis = require('ioredis');
const redis = new Redis({ host: 'localhost', port: 6380 });
redis.set('test', 'Hello Redis', (err) => {
  if (err) console.error(err);
  redis.get('test', (err, result) => {
    console.log(result); // Should print "Hello Redis"
    redis.quit();
  });
});