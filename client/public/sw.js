const CACHE_NAME = 'video-intro-cache-v1';

self.addEventListener('fetch', function(event) {
  if (event.request.url.includes('/api/coaches/video-introduction/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(response) {
          return response || fetch(event.request).then(function(response) {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});