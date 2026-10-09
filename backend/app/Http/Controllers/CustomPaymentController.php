<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Shop;
use App\Modules\Events\Interface\Events;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomPaymentController extends Controller
{
    private function authenticate(Request $request, string $integration): array
    {
        $config = config('payments.custom.'.$integration);
        $token = $request->bearerToken();
        abort_unless(is_array($config) && ($config['enabled'] ?? false) === true
            && is_string($token) && strlen($token) >= 32
            && is_string($config['token_hash'] ?? null)
            && hash_equals($config['token_hash'], hash('sha256', $token)), 401);

        return $config;
    }

    public function confirm(Request $request, string $integration): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 4096, 413);
        $config = $this->authenticate($request, $integration);
        $data = $this->validate($request, ['invoice_id' => 'required|uuid']);
        $this->validate(new Request(['key' => $request->header('Idempotency-Key')]), ['key' => 'required|uuid']);
        $shop = Shop::where('slug', $config['shop'])->firstOrFail();
        $event = DB::transaction(function () use ($data, $integration, $config, $shop, $request) {
            Shop::whereKey($shop->id)->lockForUpdate()->firstOrFail();
            $payment = Payment::where('public_id', $data['invoice_id'])->where('provider', 'custom')
                ->where('integration', $integration)->whereHas('order', fn ($q) => $q->where('shop_id', $shop->id))->lockForUpdate()->firstOrFail();
            $digest = hash('sha256', 'custom:'.$integration.':'.$request->header('Idempotency-Key'));
            $existing = PaymentEvent::where('digest', $digest)->first();
            if ($existing) {
                abort_unless($existing->payment_id === $payment->id, 409);

                return $existing;
            }
            abort_unless(in_array($payment->status, [Payment::Queued, Payment::Pending, Payment::Paid], true), 409);

            $created = PaymentEvent::create(['payment_id' => $payment->id, 'digest' => $digest,
                'payload' => ['invoice_id' => $payment->public_id, 'credential_hash' => $config['token_hash']]]);
            app(Events::class)->wake();

            return $created;
        });

        return response()->json(['received' => true, 'event_id' => $event->id, 'status' => $event->processed_at ? 'processed' : 'queued'], 202);
    }

    public function show(Request $request, string $integration, int $event): JsonResponse
    {
        $config = $this->authenticate($request, $integration);
        $record = PaymentEvent::whereKey($event)->whereHas('payment', fn ($q) => $q->where('provider', 'custom')->where('integration', $integration)
            ->whereHas('order', fn ($q) => $q->whereHas('shop', fn ($q) => $q->where('slug', $config['shop']))))->firstOrFail();

        return response()->json(['event_id' => $record->id, 'status' => $record->processed_at ? 'processed' : ($record->attempts >= 5 ? 'rejected' : 'queued')]);
    }
}
