from rest_framework import permissions, viewsets

from .models import DeviceToken
from .serializers import DeviceTokenSerializer


class DeviceTokenViewSet(viewsets.ModelViewSet):
    queryset = DeviceToken.objects.none()
    serializer_class = DeviceTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DeviceToken.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
