self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Blitz 360', {
    body: 'Novo pedido de orçamento. Abra o Blitz para ver os detalhes.',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/#banco-firestore'));
});
