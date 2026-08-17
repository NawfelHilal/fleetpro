from django.shortcuts import get_object_or_404
from django.conf import settings
import stripe
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.rides.models import Ride

from .models import Payment
from .serializers import CreatePaymentIntentSerializer, PaymentSerializer
from .services import SimulatedPaymentGateway, StripePaymentGateway


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Payment.objects.none()
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Payment.objects.all()
        return Payment.objects.filter(ride__passenger=user)

    @action(detail=False, methods=["post"], url_path="create-intent")
    def create_intent(self, request):
        serializer = CreatePaymentIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ride = get_object_or_404(Ride, id=serializer.validated_data["ride_id"], passenger=request.user)
        if ride.status != Ride.Status.REQUESTED:
            return Response({"detail": "Payment can only be prepared for a requested ride."}, status=status.HTTP_409_CONFLICT)
        payment = StripePaymentGateway().create_payment_intent(ride)
        return Response(
            {"payment": PaymentSerializer(payment).data, "client_secret": payment.client_secret},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="simulate-intent")
    def simulate_intent(self, request):
        if not settings.ENABLE_DEMO_SIMULATION:
            return Response({"detail": "Demo simulation is disabled."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CreatePaymentIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ride = get_object_or_404(Ride, id=serializer.validated_data["ride_id"], passenger=request.user)
        payment = SimulatedPaymentGateway().authorize_ride(ride)
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["post"],
        url_path="webhook",
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def webhook(self, request):
        if not settings.STRIPE_WEBHOOK_SECRET:
            return Response({"detail": "Stripe webhook is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            event = stripe.Webhook.construct_event(
                request.body,
                request.headers.get("Stripe-Signature", ""),
                settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.SignatureVerificationError):
            return Response({"detail": "Invalid Stripe signature."}, status=status.HTTP_400_BAD_REQUEST)

        intent = event["data"]["object"]
        if event["type"].startswith("payment_intent."):
            Payment.objects.filter(stripe_payment_intent_id=intent["id"]).update(status=intent["status"].upper())
        return Response({"received": True})
