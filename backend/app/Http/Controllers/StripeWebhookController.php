<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\PaymentEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

class StripeWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $secret = config('payments.stripe.webhook_secret');
        abort_unless(is_string($secret) && $secret !== '', 503);
        try {
            $event = Webhook::constructEvent($request->getContent(), (string) $request->header('Stripe-Signature'), $secret, 300);
        } catch (\UnexpectedValueException|SignatureVerificationException) {
            abort(401, 'Invalid payment signature.');
        }
        if (! in_array($event->type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'], true)) {
            return response()->json(['received' => true]);
        }
        $session = $event->data->object;
        $payment = Payment::where('provider', 'stripe')->where('public_id', $session->client_reference_id)->firstOrFail();
        PaymentEvent::firstOrCreate(['digest' => hash('sha256', 'stripe:'.$event->id)], [
            'payment_id' => $payment->id, 'payload' => ['id' => $session->id],
        ]);

        return response()->json(['received' => true]);
    }
}
