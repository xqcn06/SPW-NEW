const CACHE_NAME = 'vocabulary-card-v5.2.3-edge';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './browserconfig.xml',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 安装 Service Worker
self.addEventListener('install', function(event) {
  console.log('Service Worker 安装中... (Edge 兼容版本)');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('缓存已打开，开始缓存资源');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('所有资源已缓存完成');
        return self.skipWaiting();
      })
      .catch(error => {
        console.log('缓存过程中出现错误:', error);
      })
  );
});

// 激活 Service Worker - 增强 Edge 兼容性
self.addEventListener('activate', function(event) {
  console.log('Service Worker 激活中...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 已激活并准备就绪');
      // 在 Edge 中立即接管控制
      return self.clients.claim();
    })
  );
});

// 增强的 fetch 处理
self.addEventListener('fetch', function(event) {
  // 跳过 Chrome 扩展请求和非 GET 请求
  if (event.request.url.includes('chrome-extension') || 
      event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // 如果缓存中有，返回缓存内容
        if (response) {
          return response;
        }
        
        // 否则从网络获取
        return fetch(event.request).then(function(response) {
          // 检查是否是有效响应
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // 克隆响应以进行缓存
          var responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(function() {
          // 对于导航请求，返回缓存的首页
          if (event.request.mode === 'navigate') {
            return caches.match('./');
          }
          // 对于其他请求，可以返回自定义离线页面
          return new Response('网络连接不可用', {
            status: 408,
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// 增强的消息处理
self.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  // 处理缓存更新请求
  if (event.data && event.data.action === 'updateCache') {
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    });
  }
});