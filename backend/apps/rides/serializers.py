from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from .eligibility import driver_is_eligible_for_service
from .models import DriverProfile, Ride, Vehicle
from .services import FareCalculator


class FareQuoteSerializer(serializers.Serializer):
    distance_km = serializers.DecimalField(max_digits=7, decimal_places=2)
    duration_minutes = serializers.IntegerField(min_value=1)
    service_type = serializers.ChoiceField(choices=Ride.ServiceType.choices, default=Ride.ServiceType.STANDARD)

    def validate(self, attrs):
        quote = FareCalculator().quote(attrs["distance_km"], attrs["duration_minutes"])
        attrs["quote"] = quote
        return attrs


class FareQuoteResponseSerializer(serializers.Serializer):
    distance_km = serializers.DecimalField(max_digits=7, decimal_places=2)
    duration_minutes = serializers.IntegerField()
    fare_cents = serializers.IntegerField()
    commission_cents = serializers.IntegerField()
    driver_earnings_cents = serializers.IntegerField()


class RideSerializer(serializers.ModelSerializer):
    commission_cents = serializers.IntegerField(read_only=True)
    driver_earnings_cents = serializers.IntegerField(read_only=True)
    payment_status = serializers.SerializerMethodField()
    _links = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = [
            "id",
            "passenger",
            "driver",
            "status",
            "service_type",
            "pickup_label",
            "pickup_latitude",
            "pickup_longitude",
            "dropoff_label",
            "dropoff_latitude",
            "dropoff_longitude",
            "passenger_note",
            "cancellation_reason",
            "distance_km",
            "duration_minutes",
            "estimated_fare_cents",
            "final_fare_cents",
            "commission_cents",
            "driver_earnings_cents",
            "payment_status",
            "_links",
            "requested_at",
            "accepted_at",
            "started_at",
            "completed_at",
            "canceled_at",
        ]
        read_only_fields = [
            "id",
            "passenger",
            "driver",
            "status",
            "estimated_fare_cents",
            "final_fare_cents",
            "commission_cents",
            "driver_earnings_cents",
            "payment_status",
            "cancellation_reason",
            "requested_at",
            "accepted_at",
            "started_at",
            "completed_at",
            "canceled_at",
        ]

    def get_payment_status(self, obj) -> str | None:
        try:
            return obj.payment.status
        except ObjectDoesNotExist:
            return None

    def get__links(self, obj) -> dict[str, dict[str, str]]:
        request = self.context.get("request")

        def uri(path: str) -> str:
            if request:
                return request.build_absolute_uri(path)
            return path

        links = {
            "self": {"href": uri(f"/api/v1/rides/{obj.id}/"), "method": "GET"},
            "collection": {"href": uri("/api/v1/rides/"), "method": "GET"},
        }
        user = getattr(request, "user", None)
        user_id = getattr(user, "id", None)
        is_driver = bool(getattr(user, "is_driver", False))
        is_staff = bool(getattr(user, "is_staff", False))

        if obj.status == Ride.Status.REQUESTED:
            if is_driver and driver_is_eligible_for_service(user, obj.service_type):
                links["accept"] = {"href": uri(f"/api/v1/rides/{obj.id}/accept/"), "method": "POST"}
            if user_id == obj.passenger_id or is_staff:
                links["cancel"] = {"href": uri(f"/api/v1/rides/{obj.id}/cancel/"), "method": "POST"}
                links["payment_intent"] = {"href": uri("/api/v1/payments/create-intent/"), "method": "POST"}
                links["simulated_payment_intent"] = {"href": uri("/api/v1/payments/simulate-intent/"), "method": "POST"}
                links["simulate"] = {"href": uri(f"/api/v1/rides/{obj.id}/simulate/"), "method": "POST"}
        elif obj.status == Ride.Status.ACCEPTED:
            if user_id == obj.driver_id:
                links["start"] = {"href": uri(f"/api/v1/rides/{obj.id}/start/"), "method": "POST"}
            if user_id in {obj.passenger_id, obj.driver_id} or is_staff:
                links["cancel"] = {"href": uri(f"/api/v1/rides/{obj.id}/cancel/"), "method": "POST"}
        elif obj.status == Ride.Status.IN_PROGRESS:
            if user_id == obj.driver_id:
                links["complete"] = {"href": uri(f"/api/v1/rides/{obj.id}/complete/"), "method": "POST"}
            if user_id in {obj.passenger_id, obj.driver_id} or is_staff:
                links["cancel"] = {"href": uri(f"/api/v1/rides/{obj.id}/cancel/"), "method": "POST"}

        return links

    def create(self, validated_data):
        quote = FareCalculator().quote(
            Decimal(validated_data["distance_km"]),
            validated_data["duration_minutes"],
        )
        return Ride.objects.create(
            passenger=self.context["request"].user,
            estimated_fare_cents=quote.fare_cents,
            **validated_data,
        )


class DriverProfileSerializer(serializers.ModelSerializer):
    is_fleether_eligible = serializers.BooleanField(read_only=True)
    is_professional_profile_complete = serializers.BooleanField(read_only=True)
    is_fleet_pmr_eligible = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "user",
            "license_number",
            "professional_card_number",
            "company_name",
            "siret_number",
            "insurance_policy_number",
            "gender",
            "verified_at",
            "rating",
            "is_fleether_eligible",
            "is_fleet_pmr_eligible",
            "is_professional_profile_complete",
        ]
        read_only_fields = ["id", "user", "verified_at", "rating", "is_fleether_eligible", "is_fleet_pmr_eligible", "is_professional_profile_complete"]

    def get_is_fleet_pmr_eligible(self, obj) -> bool:
        return obj.user.vehicles.filter(is_pmr_adapted=True).exists()


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "id",
            "driver",
            "plate_number",
            "brand",
            "model",
            "color",
            "seats",
            "is_pmr_adapted",
            "pmr_certification_reference",
        ]
        read_only_fields = ["id", "driver"]
