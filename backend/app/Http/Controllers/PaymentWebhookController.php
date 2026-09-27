<?php

namespace App\Http\Controllers;

use App\Domain\Payments\Billplz;
use App\Models\Payment;
use App\Models\PaymentEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentWebhookController extends Controller
{
    public function __invoke(Request $request, string $reference, Billplz $provider): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 16384, 413);
        abort_unless(is_string(config('payments.signature_key')) && config('payments.signature_key') !== '', 503);
        $data = $request->isJson() ? $request->json()->all() : $request->request->all();
        $signature = $data['x_signature'] ?? null;
        abort_unless(is_string($signature) && preg_match('/^[a-f0-9]{64}$/D', $signature), 401);
        abort_unless(hash_equals($provider->signature($data), $signature), 401);
        $this->validate(new Request($data), ['id' => 'required|string|regex:/^[a-zA-Z0-9_-]{1,100}$/D']);
        $payment = Payment::where('public_id', $reference)->where('provider', 'billplz')->firstOrFail();
        // Durably acknowledge before doing any provider I/O or changing business state.
        PaymentEvent::firstOrCreate(['digest' => hash('sha256', $reference.$signature)], [
            'payment_id' => $payment->id, 'payload' => $data,
        ]);

        return response()->json(['received' => true]);
    }
}
