self.addEventListener('push', function (event) {
  var data = {
    title: 'E-Healthcare Portal',
    body: 'Bạn có thông báo mới từ phòng khám.',
    icon: '/assets/doctor.png',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  var title = data.title || 'E-Healthcare Portal';
  var options = {
    body: data.body,
    icon: data.icon || '/assets/doctor.png',
    badge: '/assets/doctor.png',
    data: data.data || { url: data.url || '/' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var urlToOpen = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf(urlToOpen) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
