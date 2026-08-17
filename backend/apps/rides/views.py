from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from decimal import Decimal
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import DriverProfile, Ride, Vehicle
from .eligibility import driver_is_eligible_for_service
from .matching import RideMatcher
from .permissions import IsDriverOrStaff
from .serializers import DriverProfileSerializer, FareQuoteResponseSerializer, FareQuoteSerializer, RideSerializer, VehicleSerializer
from .services import RideLifecycle


class RideViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Ride.objects.none()
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Ride.objects.all()
        if getattr(user, "is_driver", False):
            requested = Ride.objects.filter(status=Ride.Status.REQUESTED)
            nearby_ids = RideMatcher().nearby_ride_ids(user.id, requested)
            eligible_ids = [
                ride.id
                for ride in requested.filter(id__in=nearby_ids).prefetch_related("passenger")
                if driver_is_eligible_for_service(user, ride.service_type)
            ]
            return Ride.objects.filter(Q(driver=user) | Q(id__in=eligible_ids))
        return Ride.objects.filter(passenger=user)

    def create(self, request, *args, **kwargs):
        if getattr(request.user, "is_driver", False):
            return Response({"detail": "Only passengers can request rides."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def quote(self, request):
        serializer = FareQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quote = serializer.validated_data["quote"]
        return Response(FareQuoteResponseSerializer(quote).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        if not request.user.is_driver:
            return Response({"detail": "Only drivers can accept rides."}, status=status.HTTP_403_FORBIDDEN)
        visible_ride = self.get_object()
        with transaction.atomic():
            ride = Ride.objects.select_for_update().get(pk=visible_ride.pk)
            if ride.status != Ride.Status.REQUESTED:
                return Response({"detail": "Ride is not available."}, status=status.HTTP_409_CONFLICT)
            if not driver_is_eligible_for_service(request.user, ride.service_type):
                return Response({"detail": "Driver is not eligible for this service."}, status=status.HTTP_403_FORBIDDEN)
            ride = RideLifecycle().record(ride, Ride.Status.ACCEPTED, request.user)
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        ride = self.get_object()
        if ride.driver_id != request.user.id:
            return Response({"detail": "Only assigned driver can start this ride."}, status=status.HTTP_403_FORBIDDEN)
        if ride.status != Ride.Status.ACCEPTED:
            return Response({"detail": "Ride must be accepted first."}, status=status.HTTP_409_CONFLICT)
        ride = RideLifecycle().record(ride, Ride.Status.IN_PROGRESS, request.user)
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        ride = self.get_object()
        if ride.driver_id != request.user.id:
            return Response({"detail": "Only assigned driver can complete this ride."}, status=status.HTTP_403_FORBIDDEN)
        if ride.status != Ride.Status.IN_PROGRESS:
            return Response({"detail": "Ride must be in progress."}, status=status.HTTP_409_CONFLICT)
        ride = RideLifecycle().record(ride, Ride.Status.COMPLETED, request.user)
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        ride = self.get_object()
        if request.user.id not in {ride.passenger_id, ride.driver_id} and not request.user.is_staff:
            return Response({"detail": "You cannot cancel this ride."}, status=status.HTTP_403_FORBIDDEN)
        if ride.status in {Ride.Status.COMPLETED, Ride.Status.CANCELED}:
            return Response({"detail": "Ride is already closed."}, status=status.HTTP_409_CONFLICT)
        ride.cancellation_reason = str(request.data.get("reason", ""))[:255]
        ride = RideLifecycle().record(ride, Ride.Status.CANCELED, request.user)
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def simulate(self, request, pk=None):
        if not settings.ENABLE_DEMO_SIMULATION:
            return Response({"detail": "Demo simulation is disabled."}, status=status.HTTP_404_NOT_FOUND)
        ride = self.get_object()
        if ride.passenger_id != request.user.id:
            return Response({"detail": "Only the passenger can run demo simulation."}, status=status.HTTP_403_FORBIDDEN)
        if ride.status in {Ride.Status.COMPLETED, Ride.Status.CANCELED}:
            return Response(self.get_serializer(ride).data)

        User = get_user_model()
        demo_driver = User.objects.filter(username="driver", role=User.Role.DRIVER).first()
        if not demo_driver:
            return Response({"detail": "Demo driver account is missing."}, status=status.HTTP_409_CONFLICT)

        next_status = {
            Ride.Status.REQUESTED: Ride.Status.ACCEPTED,
            Ride.Status.ACCEPTED: Ride.Status.IN_PROGRESS,
            Ride.Status.IN_PROGRESS: Ride.Status.COMPLETED,
        }[ride.status]
        actor = demo_driver if next_status == Ride.Status.ACCEPTED else ride.driver or demo_driver
        ride = RideLifecycle().record(ride, next_status, actor)
        return Response(self.get_serializer(ride).data)

    @action(detail=False, methods=["post"], url_path="simulate-nearby-request")
    def simulate_nearby_request(self, request):
        if not settings.ENABLE_DEMO_SIMULATION:
            return Response({"detail": "Demo simulation is disabled."}, status=status.HTTP_404_NOT_FOUND)
        if not request.user.is_driver:
            return Response({"detail": "Only drivers can simulate nearby ride requests."}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        passenger, _ = User.objects.get_or_create(
            username="passenger",
            defaults={
                "email": "passenger@fleetpro.local",
                "role": User.Role.PASSENGER,
            },
        )
        passenger.email = "passenger@fleetpro.local"
        passenger.role = User.Role.PASSENGER
        passenger.set_password("password123")
        passenger.save(update_fields=["email", "role", "password"])

        position = RideMatcher()._driver_position(request.user.id) or (43.694318, 7.258155)
        quote = FareQuoteSerializer(
            data={
                "distance_km": "6.40",
                "duration_minutes": 18,
                "service_type": Ride.ServiceType.STANDARD,
            }
        )
        quote.is_valid(raise_exception=True)
        fare = quote.validated_data["quote"]
        ride = Ride.objects.create(
            passenger=passenger,
            service_type=Ride.ServiceType.STANDARD,
            pickup_label="Hôtel Negresco",
            pickup_latitude=Decimal(str(position[0])),
            pickup_longitude=Decimal(str(position[1])),
            dropoff_label="Aéroport Nice Côte d’Azur",
            dropoff_latitude=Decimal("43.665278"),
            dropoff_longitude=Decimal("7.215000"),
            passenger_note="Course générée depuis le mode simulation chauffeur.",
            distance_km=fare.distance_km,
            duration_minutes=fare.duration_minutes,
            estimated_fare_cents=fare.fare_cents,
        )
        return Response(self.get_serializer(ride).data, status=status.HTTP_201_CREATED)


class DriverProfileViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = DriverProfile.objects.none()
    serializer_class = DriverProfileSerializer
    permission_classes = [IsDriverOrStaff]

    def get_queryset(self):
        if self.request.user.is_staff:
            return DriverProfile.objects.all()
        return DriverProfile.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class VehicleViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Vehicle.objects.none()
    serializer_class = VehicleSerializer
    permission_classes = [IsDriverOrStaff]

    def get_queryset(self):
        if self.request.user.is_staff:
            return Vehicle.objects.all()
        return Vehicle.objects.filter(driver=self.request.user)

    def perform_create(self, serializer):
        serializer.save(driver=self.request.user)
