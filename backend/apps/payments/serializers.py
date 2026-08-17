from rest_framework import serializers

from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    _links = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "ride",
            "amount_cents",
            "currency",
            "stripe_payment_intent_id",
            "status",
            "_links",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get__links(self, obj) -> dict[str, dict[str, str]]:
        request = self.context.get("request")

        def uri(path: str) -> str:
            if request:
                return request.build_absolute_uri(path)
            return path

        return {
            "self": {"href": uri(f"/api/v1/payments/{obj.id}/"), "method": "GET"},
            "collection": {"href": uri("/api/v1/payments/"), "method": "GET"},
            "ride": {"href": uri(f"/api/v1/rides/{obj.ride_id}/"), "method": "GET"},
        }


class CreatePaymentIntentSerializer(serializers.Serializer):
    ride_id = serializers.IntegerField()
